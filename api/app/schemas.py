from __future__ import annotations

from pydantic import BaseModel


class Segment(BaseModel):
    start: int
    end: int


class ExecutionSegment(BaseModel):
    """一次穿带执行：连续分组的合并返工段统一走带。

    good_mm 为该次执行带入的完好材料（跨度内缺陷段之外的间隙总和）。
    """

    start: int
    end: int
    good_mm: int


class ZoneCoverage(BaseModel):
    """单个半开作业区 [start, end) 的覆盖明细。"""

    index: int
    start: int
    end: int
    covered_mm: int
    coverage_ratio: float


class SchedulingFailure(BaseModel):
    """行程约束下无法排程：返回越界合并段的边界，供页面定位。

    good_mm_total 为按零容限独立执行时整卷带入的完好材料（恒为零，
    作为排程分析的完好材料账目基线随响应返回）。
    """

    feasible: bool = False
    segments: list[Segment]
    good_mm_total: int


class MergeResponse(BaseModel):
    """审查结果：唯一的合并返工段、覆盖毫米数、覆盖率。

    仅当请求携带合法的 zone_length 时才包含 zones 逐区明细；
    未提供时响应保持原结构（无 zones 字段）。
    最大行程与完好材料容限成对出现：只有二者同时提供时才包含
    executions / scheduling 排程结果，字段缺省时响应结构不变。
    """

    roll_length: int
    merged: list[Segment]
    covered_mm: int
    coverage_ratio: float
    zones: list[ZoneCoverage] | None = None
    executions: list[ExecutionSegment] | None = None
    scheduling: SchedulingFailure | None = None
