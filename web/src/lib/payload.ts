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

export function buildPayload(rollLength: string, rows: DefectRow[]) {
  return {
    roll_length: toIntOrRaw(rollLength),
    defects: rows.map((row) => ({
      start: toIntOrRaw(row.start),
      end: toIntOrRaw(row.end),
    })),
  };
}
