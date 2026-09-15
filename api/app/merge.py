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


def sound_material_between(
    merged: list[Interval], group_start: int, group_end: int
) -> int:
    """一次执行跨越 [group_start, group_end] 时穿带经过的完好材料毫米数。

    合并返工段互不相接（闭区间归并后相邻段间至少有 1 mm 间隙），
    因此完好材料 = 执行跨度 - 组内返工段长度之和。
    """
    defective = sum(
        end - start
        for start, end in merged
        if start >= group_start and end <= group_end
    )
    return (group_end - group_start) - defective


def plan_executions(
    merged: list[Interval], max_travel: int, sound_tolerance: int
) -> list[Interval] | None:
    """把相邻合并返工段划为连续分组，确定唯一的执行段方案。

    每个分组对应一次穿带执行，跨度 [首段起点, 末段终点] 必须满足：
    - 跨度 ≤ max_travel（最大行程）；
    - 组内缺陷段之外的间隙总和（带入的完好材料）累计到整卷后
      不超过 sound_tolerance（整卷容限）。

    单段自身跨度即超过最大行程时无法排程，返回 None
    （零容限下各段独立执行恒可行，因此这也是唯一的不可行情形）。

    最优方案依次按以下规则决胜（前一条相等才看后一条）：
    1. 执行段数量最少；
    2. 带入的完好材料总量更少；
    3. 执行段终点序列按起点顺序的字典序更小。

    实现：best[i] 是后缀 merged[i:] 的帕累托前沿——对每个执行段数量 k
    保留完好材料最少（并列时终点序列字典序最小）的方案；前段选择分组时
    用整卷容限扣除本组完好材料后查询此前沿，保证预算跨组累计正确。
    """
    n = len(merged)
    if n == 0:
        return []

    # best[i]: {执行段数量 k: (完好材料, 终点序列, 执行段列表)}
    best: list[dict[int, tuple[int, tuple[int, ...], list[Interval]]]] = [
        {} for _ in range(n + 1)
    ]
    best[n] = {0: (0, (), [])}

    for i in range(n - 1, -1, -1):
        group_sound = 0
        frontier: dict[int, tuple[int, tuple[int, ...], list[Interval]]] = {}
        for j in range(i, n):
            start = merged[i][0]
            end = merged[j][1]
            if end - start > max_travel:
                # 段按起点升序排列，再往后只会更长
                break
            if j > i:
                # 并入 merged[j] 新增的完好材料：上一段末到这一段起点的间隙
                group_sound += merged[j][0] - merged[j - 1][1]
            if group_sound > sound_tolerance:
                # 间隙只增不减，再并入只会带入更多完好材料
                break
            for rest_count, (
                rest_sound,
                rest_ends,
                rest_runs,
            ) in best[j + 1].items():
                total_sound = group_sound + rest_sound
                if total_sound > sound_tolerance:
                    # 该后缀方案超整卷预算；同执行段数下它已是完好材料最少者
                    continue
                candidate = (
                    total_sound,
                    (end,) + rest_ends,
                    [(start, end), *rest_runs],
                )
                incumbent = frontier.get(1 + rest_count)
                if incumbent is None or _solution_better(candidate, incumbent):
                    frontier[1 + rest_count] = candidate
        best[i] = frontier

    if not best[0]:
        return None
    # 决胜顺序：执行段数 → 完好材料 → 终点序列
    _, winner = min(
        best[0].items(), key=lambda kv: (kv[0], kv[1][0], kv[1][1])
    )
    return winner[2]


def _solution_better(
    candidate: tuple[int, tuple[int, ...], list[Interval]],
    incumbent: tuple[int, tuple[int, ...], list[Interval]],
) -> bool:
    """相同执行段数量下：完好材料更少 → 终点序列字典序更小。"""
    if candidate[0] != incumbent[0]:
        return candidate[0] < incumbent[0]
    return candidate[1] < incumbent[1]
