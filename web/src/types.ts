export interface Segment {
  start: number;
  end: number;
}

/** API 返回的审查结果，页面汇总、带状图与下载文件共用同一份数据。 */
export interface MergeResponse {
  roll_length: number;
  merged: Segment[];
  covered_mm: number;
  coverage_ratio: number;
}

export interface ApiErrorItem {
  row: number | null;
  field: string | null;
  message: string;
}

/** 表格行保持原始字符串，非法值原样提交给 API 判定，前端不做本地归并。 */
export interface DefectRow {
  start: string;
  end: string;
}
