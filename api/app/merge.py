"""返工段归并核心算法。

区间一律按闭区间处理：后一段起点 <= 当前合并段终点时必须合并。
所有端点均为整数毫米，输入顺序不影响输出。
"""

from __future__ import annotations

from collections import deque
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

    实现 O(n²)：间隙前缀和 P 使组内完好材料 g(i,j)=P[j]-P[i]；
    对「恰用 k 次执行」有
        s_i(k) = -P[i] + min_{j 行程可达} (P[j] + s_{j+1}(k-1))
    固定 k 时可行 j 构成随 i 右移的窗口 [i, f(i)]，用单调队列取最小值，
    每层 O(n)；父指针只在最小值并列时保留更小的 j（即更小的首终点），
    由归纳保证终点序列字典序最小。时间 O(n²)、空间 O(n²)。
    """
    n = len(merged)
    if n == 0:
        return []

    # 零容限下各段独立执行恒可行，因此唯一不可行情形是某段自身跨度超限
    if any(end - start > max_travel for start, end in merged):
        return None

    # 容限为零：任何 1 mm 间隙都不允许跨越，各合并段必然独立执行
    if sound_tolerance == 0:
        return list(merged)

    # pref[j]：第 j 段之前（不含 j）所有相邻段间隙之和
    pref = [0] * n
    for k in range(1, n):
        pref[k] = pref[k - 1] + (merged[k][0] - merged[k - 1][1])

    # farthest[i]：从第 i 段起一次执行跨度不超最大行程时最远可并入的段；
    # merged[i][0] 随 i 增大，故 farthest 关于 i 单调不减（双指针扫描）
    farthest = [0] * n
    j = 0
    for i in range(n):
        if j < i:
            j = i
        while j + 1 < n and merged[j + 1][1] - merged[i][0] <= max_travel:
            j += 1
        farthest[i] = j

    INF = 10**30

    # k == 1：整个后缀 i..n-1 一次执行，仅当末段在行程窗口内
    choice: list[list[int]] = [[-1] * (n + 1)]  # choice[k-1] 对应 k 次执行
    base = [INF] * (n + 1)
    base_choice = [-1] * (n + 1)
    for i in range(n):
        if farthest[i] == n - 1:
            base[i] = pref[n - 1] - pref[i]
            base_choice[i] = n - 1
    choice.append(base_choice)
    if base[0] <= sound_tolerance:
        return _reconstruct(merged, choice, 1)

    # k == 2..n：逐层滚动；prev[i] 为后缀 i 恰用 k-1 次执行的最小完好材料
    prev = base
    for k in range(2, n + 1):
        cur = [INF] * (n + 1)
        cur_choice = [-1] * (n + 1)
        # 单调队列：元素 (j, value)，value = pref[j] + prev[j+1]，队首最小；
        # value 并列时保留先入队的更小 j（终点序列字典序更小）
        q: deque[tuple[int, int]] = deque()
        added = -1
        for i in range(n):
            hi = farthest[i]
            while added < hi:
                added += 1
                if prev[added + 1] >= INF:
                    continue
                value = pref[added] + prev[added + 1]
                while q and q[-1][1] > value:
                    q.pop()
                q.append((added, value))
            while q and q[0][0] < i:
                q.popleft()
            if q:
                best_j, best_value = q[0]
                cur[i] = best_value - pref[i]
                cur_choice[i] = best_j
        choice.append(cur_choice)
        if cur[0] <= sound_tolerance:
            return _reconstruct(merged, choice, k)
        prev = cur

    return None


def _reconstruct(
    merged: list[Interval], choice: list[list[int]], group_count: int
) -> list[Interval]:
    """按各层父指针还原执行段：choice[k][i] 给出首组并入的末段下标。"""
    runs: list[Interval] = []
    i = 0
    for k in range(group_count, 0, -1):
        j = choice[k][i]
        runs.append((merged[i][0], merged[j][1]))
        i = j + 1
    return runs
