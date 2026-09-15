from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .merge import (
    coverage_ratio,
    covered_length,
    merge_intervals,
    plan_executions,
    sound_material_between,
    split_zones,
    zone_covered_mm,
)
from .schemas import (
    ExecutionSegment,
    MergeResponse,
    SchedulingFailure,
    ZoneCoverage,
)
from .validation import validate_payload

app = FastAPI(title="卷材返工段审查器", version="1.0.0")

# 生产部署经 Web 容器同源反向代理；CORS 仅为本地联调便利。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/merge", response_model=MergeResponse, response_model_exclude_none=True)
async def merge(request: Request) -> MergeResponse | JSONResponse:
    try:
        payload = await request.json()
    except Exception:
        payload = None

    (
        roll_length,
        defects,
        zone_length,
        max_travel,
        sound_tolerance,
        errors,
    ) = validate_payload(payload)
    if errors:
        # 任何非法项都使整次提交失败，绝不返回部分结果
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "message": "输入校验失败，整次提交未执行",
                    "errors": errors,
                }
            },
        )

    assert roll_length is not None  # 校验通过时必有合法卷长
    merged = merge_intervals(defects)
    covered = covered_length(merged)

    zones: list[ZoneCoverage] | None = None
    if zone_length is not None:
        # 在既有合并结果上按半开作业区切分，逐区计算交集覆盖
        zones = []
        for index, (zone_start, zone_end) in enumerate(
            split_zones(roll_length, zone_length)
        ):
            zone_covered = zone_covered_mm(merged, (zone_start, zone_end))
            zones.append(
                ZoneCoverage(
                    index=index,
                    start=zone_start,
                    end=zone_end,
                    covered_mm=zone_covered,
                    coverage_ratio=coverage_ratio(
                        zone_covered, zone_end - zone_start
                    ),
                )
            )

    executions: list[ExecutionSegment] | None = None
    scheduling: SchedulingFailure | None = None
    if max_travel is not None:
        assert sound_tolerance is not None  # 成对字段，校验保证同时存在
        runs = plan_executions(merged, max_travel, sound_tolerance)
        if runs is None:
            # 零容限下各合并段独立执行；凡跨度超过最大行程者都无法排程
            offending = [
                (start, end)
                for start, end in merged
                if end - start > max_travel
            ]
            scheduling = SchedulingFailure(
                feasible=False,
                segments=[
                    {"start": start, "end": end} for start, end in offending
                ],
                good_mm_total=0,
            )
        else:
            executions = [
                ExecutionSegment(
                    start=start,
                    end=end,
                    good_mm=sound_material_between(merged, start, end),
                )
                for start, end in runs
            ]

    return MergeResponse(
        roll_length=roll_length,
        merged=[{"start": start, "end": end} for start, end in merged],
        covered_mm=covered,
        coverage_ratio=coverage_ratio(covered, roll_length),
        zones=zones,
        executions=executions,
        scheduling=scheduling,
    )
