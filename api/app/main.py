from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .merge import coverage_ratio, covered_length, merge_intervals
from .schemas import MergeResponse
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


@app.post("/api/merge", response_model=MergeResponse)
async def merge(request: Request) -> MergeResponse | JSONResponse:
    try:
        payload = await request.json()
    except Exception:
        payload = None

    roll_length, defects, errors = validate_payload(payload)
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
    return MergeResponse(
        roll_length=roll_length,
        merged=[{"start": start, "end": end} for start, end in merged],
        covered_mm=covered,
        coverage_ratio=coverage_ratio(covered, roll_length),
    )
