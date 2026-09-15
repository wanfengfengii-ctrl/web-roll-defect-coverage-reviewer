"""穿带排程的独立判据 + API 契约。

锁定规则：
- 复用唯一合并返工段，把相邻段划为连续分组，每组一次穿带执行；
- 每段跨度不超过最大行程，所有执行带入的完好材料（组内缺陷外间隙）
  总和不超过整卷容限；
- 决胜顺序：执行段最少 → 完好材料更少 → 终点序列字典序更小；
- 零容限时各合并段独立执行；任一合并段自身超过最大行程则无法排程。
"""

from __future__ import annotations

import random

from fastapi.testclient import TestClient

from app.main import app
from app.merge import merge_intervals, plan_executions, sound_material_between

client = TestClient(app)


def brute_force_optimal(merged, max_travel, sound_tolerance):
    """枚举全部 2**(n-1) 种切分，按决胜规则返回最优执行段（仅测试用参照）。"""
    n = len(merged)
    best_key = None
    best_runs = None
    for mask in range(1 << max(0, n - 1)):
        runs = []
        start_index = 0
        sound_total = 0
        feasible = True
        for i in range(n - 1):
            if mask >> i & 1:
                # 在 i 与 i+1 之间断开
                s, e = merged[start_index][0], merged[i][1]
                if e - s > max_travel:
                    feasible = False
                    break
                sound_total += sound_material_between(merged, s, e)
                if sound_total > sound_tolerance:
                    feasible = False
                    break
                runs.append((s, e))
                start_index = i + 1
        if not feasible:
            continue
        s, e = merged[start_index][0], merged[-1][1]
        if e - s > max_travel:
            continue
        sound_total += sound_material_between(merged, s, e)
        if sound_total > sound_tolerance:
            continue
        runs.append((s, e))
        key = (len(runs), sound_total, tuple(e for _, e in runs))
        if best_key is None or key < best_key:
            best_key = key
            best_runs = runs
    return best_runs


class TestPlanExecutions:
    def test_empty_merged_is_empty_plan(self):
        assert plan_executions([], 100, 0) == []

    def test_single_segment_is_one_execution(self):
        assert plan_executions([(10, 40)], 100, 0) == [(10, 40)]

    def test_four_separated_segments_middle_gap_blocks_bridge(self):
        # 四个分离段：外侧间隙均为 1 mm，中间间隙 100 mm。
        # 容限 2 mm → 中间隙阻断两侧合并，全局最优为左右各一次执行（两段）。
        merged = [(0, 100), (101, 200), (300, 400), (401, 500)]
        runs = plan_executions(merged, max_travel=200, sound_tolerance=2)
        assert runs == [(0, 200), (300, 500)]
        assert sound_material_between(merged, 0, 200) == 1
        assert sound_material_between(merged, 300, 500) == 1

    def test_zero_tolerance_each_segment_runs_independently(self):
        merged = [(0, 100), (101, 200), (300, 400), (401, 500)]
        runs = plan_executions(merged, max_travel=10_000, sound_tolerance=0)
        assert runs == list(merged)

    def test_zero_tolerance_with_touching_distances_still_independent(self):
        # 间隙哪怕只有 1 mm，零容限下也不得跨段
        merged = [(0, 10), (11, 20), (21, 30)]
        assert plan_executions(merged, 10_000, 0) == list(merged)

    def test_segment_exceeding_max_travel_is_infeasible(self):
        merged = [(0, 100), (101, 200), (300, 400), (401, 500)]
        assert plan_executions(merged, max_travel=99, sound_tolerance=0) is None

    def test_intermediate_segment_exceeding_max_travel_is_infeasible(self):
        merged = [(0, 10), (100, 260), (300, 310)]
        assert plan_executions(merged, max_travel=100, sound_tolerance=1000) is None

    def test_global_counterexample_against_prefix_greedy(self):
        # 间隙 10/8/8，容限 16，行程 66。
        # 「尽量向前并入」的贪心：先并 {s0,s1}（完好 10），再并 s2 需 18 >
        # 容限而断开；右侧 s2、s3 合并也会让总量达 18 → 三次执行。
        # 全局最优放弃 g1，把后三段并成一次：完好 8+8=16，仅两次执行。
        merged = [(0, 10), (20, 30), (38, 48), (56, 66)]
        runs = plan_executions(merged, max_travel=66, sound_tolerance=16)
        assert runs == [(0, 10), (20, 66)]
        assert sound_material_between(merged, 20, 66) == 16

    def test_tiebreak_fewer_executions_beats_less_sound(self):
        # 两段并一次完好 5 mm；拆成两次完好 0：执行段更少优先
        merged = [(0, 10), (15, 20)]
        assert plan_executions(merged, max_travel=20, sound_tolerance=10) == [
            (0, 20)
        ]

    def test_tiebreak_less_sound_material(self):
        # 三段、容限 10：一次执行需完好 15 > 容限，故执行段数固定为 2。
        # 两种切分都可行——左并（完好 5）或右并（完好 10），
        # 完好材料更少的左并方案胜出
        merged = [(0, 10), (15, 25), (35, 45)]
        runs = plan_executions(merged, max_travel=45, sound_tolerance=10)
        assert runs == [(0, 25), (35, 45)]
        assert sound_material_between(merged, 0, 25) == 5
        assert sound_material_between(merged, 35, 45) == 0

    def test_tiebreak_lexicographically_smaller_end_sequence(self):
        # g1 == g2 == 5：两次执行的两种切分完好量相同，
        # 终点序列字典序更小者（先切出最左的单段 [0,10]）胜
        merged = [(0, 10), (15, 20), (25, 35)]
        runs = plan_executions(merged, max_travel=35, sound_tolerance=5)
        assert runs == [(0, 10), (15, 35)]

    def test_solution_is_unique_and_matches_brute_force(self):
        rng = random.Random(20260915)
        for case in range(300):
            roll = rng.randint(1, 400)
            defects = []
            cursor = 0
            for _ in range(rng.randint(1, 6)):
                start = rng.randint(cursor, min(cursor + 12, roll - 1)) if cursor < roll else cursor
                if start >= roll:
                    break
                end = rng.randint(start + 1, min(roll, start + rng.randint(1, 20)))
                defects.append((start, end))
                cursor = end
            merged = merge_intervals(defects)
            if not merged:
                continue
            max_travel = rng.randint(1, roll)
            tolerance = rng.randint(0, roll)
            expected = brute_force_optimal(merged, max_travel, tolerance)
            got = plan_executions(merged, max_travel, tolerance)
            assert got == expected, (
                f"case {case}: {merged=} {max_travel=} {tolerance=} "
                f"got {got} expected {expected}"
            )

    def test_execution_spans_never_exceed_limits(self):
        rng = random.Random(99)
        for _ in range(200):
            raw = []
            for _ in range(rng.randint(1, 8)):
                s = rng.randint(0, 900)
                raw.append((s, s + rng.randint(1, 50)))
            merged = merge_intervals(raw)
            max_travel = rng.randint(1, 1000)
            tolerance = rng.randint(0, 1000)
            runs = plan_executions(merged, max_travel, tolerance)
            if runs is None:
                assert any(e - s > max_travel for s, e in merged)
                continue
            assert all(e - s <= max_travel for s, e in runs)
            assert (
                sum(sound_material_between(merged, s, e) for s, e in runs)
                <= tolerance
            )
            # 执行段按起点升序、首尾恰好覆盖全部合并段
            assert runs[0][0] == merged[0][0]
            assert runs[-1][1] == merged[-1][1]


class TestSchedulingApi:
    def test_executions_present_when_pair_given(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 500,
                "max_travel": 200,
                "sound_tolerance": 2,
                "defects": [
                    {"start": 0, "end": 100},
                    {"start": 101, "end": 200},
                    {"start": 300, "end": 400},
                    {"start": 401, "end": 500},
                ],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        # 合并边界与覆盖账目完全不变
        assert body["merged"] == [
            {"start": 0, "end": 100},
            {"start": 101, "end": 200},
            {"start": 300, "end": 400},
            {"start": 401, "end": 500},
        ]
        assert body["covered_mm"] == 398
        assert body["executions"] == [
            {"start": 0, "end": 200, "good_mm": 1},
            {"start": 300, "end": 500, "good_mm": 1},
        ]
        assert "scheduling" not in body

    def test_zero_tolerance_runs_each_segment_independently(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 500,
                "max_travel": 500,
                "sound_tolerance": 0,
                "defects": [
                    {"start": 0, "end": 100},
                    {"start": 101, "end": 200},
                    {"start": 300, "end": 400},
                ],
            },
        )
        body = resp.json()
        assert body["executions"] == [
            {"start": 0, "end": 100, "good_mm": 0},
            {"start": 101, "end": 200, "good_mm": 0},
            {"start": 300, "end": 400, "good_mm": 0},
        ]

    def test_infeasible_returns_failure_with_segment_boundaries(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "max_travel": 100,
                "sound_tolerance": 50,
                "defects": [
                    {"start": 0, "end": 20},
                    {"start": 300, "end": 500},  # 跨度 200 > 100
                    {"start": 800, "end": 850},
                ],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "executions" not in body
        assert body["scheduling"] == {
            "feasible": False,
            "segments": [{"start": 300, "end": 500}],
            "good_mm_total": 0,
        }

    def test_infeasible_reports_every_oversized_segment(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "max_travel": 50,
                "sound_tolerance": 0,
                "defects": [
                    {"start": 0, "end": 60},
                    {"start": 100, "end": 120},
                    {"start": 200, "end": 300},
                ],
            },
        )
        body = resp.json()
        assert body["scheduling"]["segments"] == [
            {"start": 0, "end": 60},
            {"start": 200, "end": 300},
        ]

    def test_pair_omitted_leaves_response_untouched(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "defects": [{"start": 10, "end": 20}],
            },
        )
        assert resp.json() == {
            "roll_length": 1000,
            "merged": [{"start": 10, "end": 20}],
            "covered_mm": 10,
            "coverage_ratio": 0.01,
        }

    def test_null_pair_behaves_as_omitted(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "max_travel": None,
                "sound_tolerance": None,
                "defects": [{"start": 10, "end": 20}],
            },
        )
        body = resp.json()
        assert "executions" not in body
        assert "scheduling" not in body

    def test_scheduling_and_zones_coexist_without_altering_accounts(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 500,
                "zone_length": 250,
                "max_travel": 200,
                "sound_tolerance": 2,
                "defects": [
                    {"start": 0, "end": 100},
                    {"start": 101, "end": 200},
                    {"start": 300, "end": 400},
                    {"start": 401, "end": 500},
                ],
            },
        )
        body = resp.json()
        assert body["zones"] == [
            {"index": 0, "start": 0, "end": 250, "covered_mm": 199, "coverage_ratio": 0.8},
            {"index": 1, "start": 250, "end": 500, "covered_mm": 199, "coverage_ratio": 0.8},
        ]
        assert body["executions"] == [
            {"start": 0, "end": 200, "good_mm": 1},
            {"start": 300, "end": 500, "good_mm": 1},
        ]
        assert sum(z["covered_mm"] for z in body["zones"]) == body["covered_mm"]


class TestSchedulingValidation:
    def _errors(self, payload):
        resp = client.post("/api/merge", json=payload)
        assert resp.status_code == 422
        return resp.json()["detail"]["errors"]

    def test_only_max_travel_fails_on_both_fields(self):
        errors = self._errors(
            {
                "roll_length": 1000,
                "max_travel": 200,
                "defects": [{"start": 1, "end": 2}],
            }
        )
        fields = {e["field"] for e in errors}
        assert fields == {"max_travel", "sound_tolerance"}
        assert all(e["row"] is None for e in errors)

    def test_only_sound_tolerance_fails_on_both_fields(self):
        errors = self._errors(
            {
                "roll_length": 1000,
                "sound_tolerance": 50,
                "defects": [{"start": 1, "end": 2}],
            }
        )
        assert {e["field"] for e in errors} == {
            "max_travel",
            "sound_tolerance",
        }

    def test_bad_types(self):
        for field, bad in [
            ("max_travel", 1.5),
            ("max_travel", "200"),
            ("max_travel", True),
            ("sound_tolerance", 1.5),
            ("sound_tolerance", "50"),
            ("sound_tolerance", False),
        ]:
            payload = {
                "roll_length": 1000,
                "max_travel": 200,
                "sound_tolerance": 50,
                "defects": [{"start": 1, "end": 2}],
            }
            payload[field] = bad
            errors = self._errors(payload)
            assert any(e["field"] == field for e in errors)

    def test_ranges(self):
        for field, bad in [
            ("max_travel", 0),
            ("max_travel", -1),
            ("max_travel", 1001),
            ("sound_tolerance", -1),
            ("sound_tolerance", 1001),
        ]:
            payload = {
                "roll_length": 1000,
                "max_travel": 200,
                "sound_tolerance": 50,
                "defects": [{"start": 1, "end": 2}],
            }
            payload[field] = bad
            errors = self._errors(payload)
            assert any(e["field"] == field and e["row"] is None for e in errors)

    def test_boundaries_accepted(self):
        for travel, tolerance in [(1, 0), (1000, 0), (1, 1000), (1000, 1000)]:
            resp = client.post(
                "/api/merge",
                json={
                    "roll_length": 1000,
                    "max_travel": travel,
                    "sound_tolerance": tolerance,
                    "defects": [{"start": 0, "end": 1000}],
                },
            )
            assert resp.status_code == 200, (travel, tolerance)

    def test_multiple_errors_stable_order_fields_before_rows(self):
        errors = self._errors(
            {
                "roll_length": 1000,
                "max_travel": 0,
                "sound_tolerance": 2000,
                "defects": [
                    {"start": "a", "end": 2},
                    {"start": 1, "end": 9999},
                ],
            }
        )
        fields_order = [
            (e["row"], e["field"]) for e in errors
        ]
        # 表单字段错误（row=None）全部排在缺陷行错误之前，且字段顺序固定
        form_fields = [f for row, f in fields_order if row is None]
        row_fields = [(row, f) for row, f in fields_order if row is not None]
        assert form_fields == ["max_travel", "sound_tolerance"]
        assert row_fields == [(0, "start"), (1, "end")]

    def test_invalid_pair_returns_no_scheduling_body(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "max_travel": 200,
                # 缺 sound_tolerance
                "defects": [{"start": 1, "end": 2}],
            },
        )
        assert resp.status_code == 422
        body = resp.json()
        assert "merged" not in body
        assert "executions" not in body
