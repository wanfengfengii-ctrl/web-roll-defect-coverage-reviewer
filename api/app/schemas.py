from __future__ import annotations

from pydantic import BaseModel


class Segment(BaseModel):
    start: int
    end: int


class MergeResponse(BaseModel):
    """审查结果：唯一的合并返工段、覆盖毫米数、覆盖率。"""

    roll_length: int
    merged: list[Segment]
    covered_mm: int
    coverage_ratio: float
