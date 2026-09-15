"""作业区切分与逐区覆盖账目的独立判据 + API 契约。

锁定三条账目规则：跨区段按交集拆分、分界端点只计入右侧作业区、
末区可短于设定长度且按实际长度计比率。
"""

from __future__ import annotations

import random

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.merge import (
    covered_length,
    merge_intervals,
    split_zones,
    zone_covered_mm,
)

client = TestClient(app)


class TestSplitZones:
    def test_exact_division(self):
        assert split_zones(900, 300) == [(0, 300), (300, 600), (600, 900)]

    def test_last_zone_may_be_short(self):
        assert split_zones(1000, 300) == [
            (0, 300),
            (300, 600),
            (600, 900),
            (900, 1000),
        ]

    def test_zone_length_equals_roll_gives_single_zone(self):
        assert split_zones(500, 500) == [(0, 500)]

    def test_minimal_roll(self):
        assert split_zones(1, 1) == [(0, 1)]

    def test_zones_tile_the_roll_without_gaps(self):
        for roll, size in [(1, 1), (999, 7), (1000, 1000), (1_000_000, 1)]:
            zones = split_zones(roll, size)
            assert zones[0][0] == 0
            assert zones[-1][1] == roll
            for prev, nxt in zip(zones, zones[1:]):
                # 半开区间首尾相接：分界线只属于右侧作业区
                assert prev[1] == nxt[0]


class TestZoneCoveredMm:
    def test_segment_spanning_multiple_zones(self):
        # [100, 700] 横跨三个作业区，按交集逐区入账
        merged = [(100, 700)]
        zones = split_zones(1000, 300)
        assert [zone_covered_mm(merged, z) for z in zones] == [200, 300, 100, 0]

    def test_endpoint_on_boundary_counts_only_right_zone(self):
        # 段终点恰在分界线 300：左区计到 300 为止，右区只得到零宽点
        assert [zone_covered_mm([(0, 300)], z) for z in split_zones(600, 300)] == [
            300,
            0,
        ]
        # 段起点恰在分界线：全部计入右侧作业区
        assert [
            zone_covered_mm([(300, 600)], z) for z in split_zones(600, 300)
        ] == [0, 300]

    def test_touching_segments_across_boundary_not_double_counted(self):
        # 闭区间合并后 [0, 300] 与 [300, 600] 相接成 [0, 600]，
        # 分界点 300 不得被两个作业区重复计入
        merged = merge_intervals([(0, 300), (300, 600)])
        zones = split_zones(600, 300)
        per_zone = [zone_covered_mm(merged, z) for z in zones]
        assert per_zone == [300, 300]
        assert sum(per_zone) == covered_length(merged)

    def test_short_last_zone_uses_actual_length(self):
        merged = [(850, 1000)]
        zones = split_zones(1000, 300)
        assert zones[-1] == (900, 1000)  # 末区短于设定长度 300
        assert zone_covered_mm(merged, zones[-1]) == 100

    def test_per_zone_sum_always_equals_total_covered(self):
        rng = random.Random(20260914)
        for _ in range(50):
            roll = rng.randint(1, 5000)
            size = rng.randint(1, roll)
            defects = []
            for _ in range(rng.randint(1, 8)):
                start = rng.randint(0, roll - 1)
                end = rng.randint(start + 1, roll)
                defects.append((start, end))
            merged = merge_intervals(defects)
            zones = split_zones(roll, size)
            assert sum(zone_covered_mm(merged, z) for z in zones) == covered_length(
                merged
            )


class TestZonesApi:
    def test_zones_present_when_zone_length_given(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "zone_length": 400,
                "defects": [
                    {"start": 100, "end": 500},
                    {"start": 850, "end": 950},
                ],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        # 合并结果与整卷账目保持不变
        assert body["merged"] == [
            {"start": 100, "end": 500},
            {"start": 850, "end": 950},
        ]
        assert body["covered_mm"] == 500
        assert body["coverage_ratio"] == 0.5
        # 逐区明细：末区 [800, 1000) 短于设定长度，按实际长度 200 计比率
        assert body["zones"] == [
            {"index": 0, "start": 0, "end": 400, "covered_mm": 300, "coverage_ratio": 0.75},
            {"index": 1, "start": 400, "end": 800, "covered_mm": 100, "coverage_ratio": 0.25},
            {"index": 2, "start": 800, "end": 1000, "covered_mm": 100, "coverage_ratio": 0.5},
        ]

    def test_zone_ratio_rounds_half_up_on_actual_zone_length(self):
        # 末区实际长度 100，覆盖 15 → 0.15；整卷覆盖率则按卷长 1000 计
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "zone_length": 300,
                "defects": [{"start": 915, "end": 930}],
            },
        )
        assert resp.status_code == 200
        last = resp.json()["zones"][-1]
        assert last["start"] == 900 and last["end"] == 1000
        assert last["covered_mm"] == 15
        assert last["coverage_ratio"] == 0.15

    def test_zones_absent_when_zone_length_omitted(self):
        resp = client.post(
            "/api/merge",
            json={"roll_length": 1000, "defects": [{"start": 10, "end": 20}]},
        )
        assert resp.status_code == 200
        # 未填写时响应保持当前结构，无 zones 字段
        assert resp.json() == {
            "roll_length": 1000,
            "merged": [{"start": 10, "end": 20}],
            "covered_mm": 10,
            "coverage_ratio": 0.01,
        }

    def test_zone_length_equal_to_roll_accepted(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "zone_length": 1000,
                "defects": [{"start": 0, "end": 1000}],
            },
        )
        assert resp.status_code == 200
        assert resp.json()["zones"] == [
            {
                "index": 0,
                "start": 0,
                "end": 1000,
                "covered_mm": 1000,
                "coverage_ratio": 1.0,
            }
        ]

    @pytest.mark.parametrize("bad", [1.5, 300.0, "300", "", True, [300], {"v": 300}])
    def test_non_integer_zone_length_fails_with_field(self, bad):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "zone_length": bad,
                "defects": [{"start": 1, "end": 2}],
            },
        )
        assert resp.status_code == 422
        errors = resp.json()["detail"]["errors"]
        assert any(
            e["field"] == "zone_length" and e["row"] is None for e in errors
        )

    @pytest.mark.parametrize("bad", [0, -1, 1001, 1_000_000])
    def test_zone_length_out_of_range_fails_with_field(self, bad):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "zone_length": bad,
                "defects": [{"start": 1, "end": 2}],
            },
        )
        assert resp.status_code == 422
        errors = resp.json()["detail"]["errors"]
        assert any(
            e["field"] == "zone_length" and e["row"] is None for e in errors
        )

    def test_invalid_zone_length_returns_no_result_body(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "zone_length": 0,
                "defects": [{"start": 1, "end": 2}],
            },
        )
        assert resp.status_code == 422
        body = resp.json()
        assert "merged" not in body
        assert "zones" not in body

    def test_null_zone_length_behaves_as_omitted(self):
        resp = client.post(
            "/api/merge",
            json={
                "roll_length": 1000,
                "zone_length": None,
                "defects": [{"start": 10, "end": 20}],
            },
        )
        assert resp.status_code == 200
        assert "zones" not in resp.json()
