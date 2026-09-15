import type { DefectRow } from "../types";

const INT_PATTERN = /^-?\d+$/;

/**
 * 能确定为整数的输入转成 number 提交；
 * 其余（空串、小数、字母等）原样作为字符串提交，由 API 判定为非法并定位行号。
 */
export function toIntOrRaw(raw: string): number | string {
  const trimmed = raw.trim();
  return INT_PATTERN.test(trimmed) ? Number(trimmed) : trimmed;
}

export interface MergePayload {
  roll_length: number | string;
  defects: { start: number | string; end: number | string }[];
  zone_length?: number | string;
}

export function buildPayload(
  rollLength: string,
  rows: DefectRow[],
  zoneLength = "",
): MergePayload {
  const payload: MergePayload = {
    roll_length: toIntOrRaw(rollLength),
    defects: rows.map((row) => ({
      start: toIntOrRaw(row.start),
      end: toIntOrRaw(row.end),
    })),
  };
  // 作业区长度为可选项：留空（含全空白）时不携带该字段，请求保持原结构；
  // 填了非整数则原样提交，由 API 返回指向 zone_length 的 422。
  if (zoneLength.trim() !== "") {
    payload.zone_length = toIntOrRaw(zoneLength);
  }
  return payload;
}
