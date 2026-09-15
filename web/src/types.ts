export interface Segment {
  start: number;
  end: number;
}

/** 一次穿带执行：连续分组的合并返工段统一走带。 */
export interface ExecutionSegment {
  start: number;
  end: number;
  /** 该次执行带入的完好材料毫米数（跨度内缺陷段之外的间隙总和）。 */
  good_mm: number;
}

/** 无法排程时的说明：超过最大行程的合并段边界与整卷完好材料账目。 */
export interface SchedulingFailure {
  feasible: false;
  segments: Segment[];
  good_mm_total: number;
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
  /** 仅当同时携带最大行程与完好材料容限且排程可行时存在。 */
  executions?: ExecutionSegment[];
  /** 仅当排程参数齐全但无法排程时存在。 */
  scheduling?: SchedulingFailure;
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
