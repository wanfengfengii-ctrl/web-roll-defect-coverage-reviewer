export interface Segment {
  start: number;
  end: number;
}

/** 单个半开作业区 [start, end) 的覆盖明细。 */
export interface ZoneCoverage {
  index: number;
  start: number;
  end: number;
  covered_mm: number;
  coverage_ratio: number;
}

/** API 返回的审查结果，页面汇总、带状图与下载文件共用同一份数据。 */
export interface MergeResponse {
  roll_length: number;
  merged: Segment[];
  covered_mm: number;
  coverage_ratio: number;
  /** 仅当请求携带 zone_length 时存在；未填写时响应保持原结构。 */
  zones?: ZoneCoverage[];
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
