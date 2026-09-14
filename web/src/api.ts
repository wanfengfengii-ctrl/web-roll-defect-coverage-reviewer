import { ApiRequestError } from "./lib/errors";
import type { MergeResponse } from "./types";

/**
 * 提交审查。前端不实现任何本地归并逻辑，
 * 唯一的真值来源是 FastAPI 的 /api/merge。
 */
export async function postMerge(payload: unknown): Promise<MergeResponse> {
  let resp: Response;
  try {
    resp = await fetch("/api/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiRequestError(0, null);
  }
  const body: unknown = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new ApiRequestError(resp.status, body);
  }
  return body as MergeResponse;
}
