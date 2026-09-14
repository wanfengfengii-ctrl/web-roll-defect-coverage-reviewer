"""归并算法的独立判据：不依赖 Web 层，直接锁定区间规则。"""

from __future__ import annotations

import random

import pytest

from app.merge import coverage_ratio, covered_length, merge_intervals


class TestMergeIntervals:
    def test_empty_input(self):
        assert merge_intervals([]) == []

    def test_single_interval(self):
        assert merge_intervals([(3, 8)]) == [(3, 8)]

    def test_overlapping_intervals_merge(self):
        assert merge_intervals([(1, 5), (3, 7)]) == [(1, 7)]

    def test_touching_intervals_merge_because_closed(self):
        # 闭区间：后一段起点 == 当前段终点时必须合并
        assert merge_intervals([(1, 5), (5, 9)]) == [(1, 9)]

    def test_disjoint_intervals_stay_separate(self):
        assert merge_intervals([(1, 3), (5, 9)]) == [(1, 3), (5, 9)]

    def test_gap_of_one_mm_stays_separate(self):
        # 终点 5 与起点 6 之间不相接，不得合并
        assert merge_intervals([(1, 5), (6, 9)]) == [(1, 5), (6, 9)]

    def test_nested_interval_absorbed(self):
        assert merge_intervals([(1, 10), (2, 3), (4, 5)]) == [(1, 10)]

    def test_duplicate_intervals_collapse(self):
        assert merge_intervals([(2, 4), (2, 4)]) == [(2, 4)]

    def test_chain_of_touching_intervals(self):
        assert merge_intervals([(1, 2), (2, 3), (3, 4)]) == [(1, 4)]

    def test_output_sorted_by_start(self):
        assert merge_intervals([(10, 20), (1, 3), (5, 6)]) == [
            (1, 3),
            (5, 6),
            (10, 20),
        ]

    def test_later_interval_extends_then_next_disjoint(self):
        assert merge_intervals([(10, 20), (15, 25), (26, 30), (40, 50)]) == [
            (10, 25),
            (26, 30),
            (40, 50),
        ]

    def test_full_roll(self):
        assert merge_intervals([(0, 1_000_000)]) == [(0, 1_000_000)]

    def test_input_order_does_not_change_output(self):
        defects = [(10, 20), (400, 500), (15, 25), (900, 950), (40, 60), (20, 40)]
        expected = merge_intervals(defects)
        rng = random.Random(20260914)
        for _ in range(50):
            shuffled = defects[:]
            rng.shuffle(shuffled)
            assert merge_intervals(shuffled) == expected


class TestCoveredLength:
    def test_empty(self):
        assert covered_length([]) == 0

    def test_single_segment_is_end_minus_start(self):
        assert covered_length([(1, 5)]) == 4

    def test_sum_over_segments(self):
        assert covered_length([(1, 5), (10, 20)]) == 14

    def test_closed_interval_chain_counts_merged_span(self):
        merged = merge_intervals([(1, 2), (2, 3), (3, 4)])
        assert covered_length(merged) == 3


class TestCoverageRatio:
    @pytest.mark.parametrize(
        ("covered", "roll_length", "expected"),
        [
            (0, 1000, 0.0),
            (1, 2, 0.5),
            (1, 3, 0.33),
            (2, 3, 0.67),
            (15, 1000, 0.02),   # 0.015 → 四舍五入为 0.02
            (25, 1000, 0.03),   # 0.025 → 四舍五入为 0.03
            (124, 1000, 0.12),
            (125, 1000, 0.13),  # 0.125 → 四舍五入为 0.13（非银行家舍入）
            (1_000_000, 1_000_000, 1.0),
            (999_999, 1_000_000, 1.0),
        ],
    )
    def test_half_up_rounding(self, covered, roll_length, expected):
        assert coverage_ratio(covered, roll_length) == expected
