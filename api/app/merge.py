"""返工段归并核心算法。

区间一律按闭区间处理：后一段起点 <= 当前合并段终点时必须合并。
所有端点均为整数毫米，输入顺序不影响输出。
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable

Interval = tuple[int, int]


def merge_intervals(intervals: Iterable[Interval]) -> list[Interval]:
    """把若干缺陷闭区间归并为互不重叠、按起点升序的返工段。"""
    ordered = sorted(intervals, key=lambda iv: (iv[0], iv[1]))
    merged: list[list[int]] = []
    for start, end in ordered:
        if merged and start <= merged[-1][1]:
            # 闭区间：起点落在当前段终点之内（含相接）→ 合并
            if end > merged[-1][1]:
                merged[-1][1] = end
        else:
            merged.append([start, end])
    return [(start, end) for start, end in merged]


def covered_length(merged: Iterable[Interval]) -> int:
    """覆盖长度 = 各合并段「终点 - 起点」之和。"""
    return sum(end - start for start, end in merged)


def coverage_ratio(covered: int, roll_length: int) -> float:
    """覆盖率 = 覆盖长度 / 卷长，四舍五入（ROUND_HALF_UP）到小数点后两位。"""
    ratio = (Decimal(covered) / Decimal(roll_length)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return float(ratio)


def split_zones(roll_length: int, zone_length: int) -> list[Interval]:
    """把卷材按从零开始的半开作业区 [start, end) 切分。

    末区允许短于设定长度；相邻作业区首尾相接、不留缝隙，
    分界线上的点只归属于右侧作业区。
    """
    zones: list[Interval] = []
    start = 0
    while start < roll_length:
        end = min(start + zone_length, roll_length)
        zones.append((start, end))
        start = end
    return zones


def zone_covered_mm(merged: Iterable[Interval], zone: Interval) -> int:
    """合并返工段与半开作业区 [start, end) 的区间交集毫米数。

    端点落在分界线时只计入右侧作业区：交集长度按
    min(段终点, 区终点) - max(段起点, 区起点) 计算，
    分界点本身宽度为零，不会被左右两区重复计入，
    因此各作业区覆盖之和恒等于整卷覆盖长度。
    """
    zone_start, zone_end = zone
    return sum(
        max(0, min(end, zone_end) - max(start, zone_start))
        for start, end in merged
    )
