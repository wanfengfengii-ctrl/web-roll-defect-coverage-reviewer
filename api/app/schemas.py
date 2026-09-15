from __future__ import annotations

from pydantic import BaseModel


class Segment(BaseModel):
    start: int
    end: int


class ZoneCoverage(BaseModel):
    """单个半开作业区 [start, end) 的覆盖明细。"""

    index: int
    start: int
    end: int
    covered_mm: int
    coverage_ratio: float


class MergeResponse(BaseModel):
    """审查结果：唯一的合并返工段、覆盖毫米数、覆盖率。

    仅当请求携带合法的 zone_length 时才包含 zones 逐区明细；
    未提供时响应保持原结构（无 zones 字段）。
    """

    roll_length: int
    merged: list[Segment]
    covered_mm: int
    coverage_ratio: float
    zones: list[ZoneCoverage] | None = None
