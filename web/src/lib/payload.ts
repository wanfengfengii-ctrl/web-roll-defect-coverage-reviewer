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
  max_travel?: number | string;
  sound_tolerance?: number | string;
}

export function buildPayload(
  rollLength: string,
  rows: DefectRow[],
  zoneLength = "",
  maxTravel = "",
  soundTolerance = "",
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
  // 最大行程与完好材料容限成对可选：各自留空则不携带，只填一个时
  // 仅携带已填字段，由 API 返回同时指向两个字段的成对性 422。
  if (maxTravel.trim() !== "") {
    payload.max_travel = toIntOrRaw(maxTravel);
  }
  if (soundTolerance.trim() !== "") {
    payload.sound_tolerance = toIntOrRaw(soundTolerance);
  }
  return payload;
}
