import type { ApiErrorItem } from "../types";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`请求失败：HTTP ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

interface RawError {
  row?: unknown;
  field?: unknown;
  message?: unknown;
}

/** 把 API 的 422 detail.errors 规整为页面可渲染的错误列表。 */
export function normalizeApiErrors(err: unknown): ApiErrorItem[] {
  if (err instanceof ApiRequestError) {
    const detail = (err.body as { detail?: { errors?: RawError[] } } | null)
      ?.detail;
    if (detail && Array.isArray(detail.errors) && detail.errors.length > 0) {
      return detail.errors.map((item) => ({
        row: typeof item.row === "number" ? item.row : null,
        field: typeof item.field === "string" ? item.field : null,
        message: String(item.message ?? "输入无效"),
      }));
    }
    return [
      {
        row: null,
        field: null,
        message: `服务拒绝请求（HTTP ${err.status}），请稍后重试`,
      },
    ];
  }
  return [
    { row: null, field: null, message: "无法连接审查服务，请确认网络后重试" },
  ];
}
