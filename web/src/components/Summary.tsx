import type { MergeResponse } from "../types";

/** 汇总区：与带状图、下载 JSON 使用同一份 API 结果。 */
export function Summary({ result }: { result: MergeResponse }) {
  return (
    <section data-testid="summary" className="summary">
      <p>
        覆盖长度：
        <strong data-testid="summary-covered">{result.covered_mm}</strong> mm
      </p>
      <p>
        覆盖率：
        <strong data-testid="summary-ratio">{result.coverage_ratio}</strong>
      </p>
      <p>
        合并段数：
        <strong data-testid="summary-count">{result.merged.length}</strong>
      </p>
      <ol data-testid="segment-list" className="segment-list">
        {result.merged.map((seg, i) => (
          <li key={i} data-testid="segment-item">
            [{seg.start}, {seg.end}]（{seg.end - seg.start} mm）
          </li>
        ))}
      </ol>
    </section>
  );
}
