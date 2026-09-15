import type { MergeResponse } from "../types";

interface Props {
  result: MergeResponse;
  /** 带状图上选中的作业区下标；对应表格行高亮。 */
  selectedZone?: number | null;
}

/** 汇总区：与带状图、下载 JSON 使用同一份 API 结果。 */
export function Summary({ result, selectedZone = null }: Props) {
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
      {result.zones && result.zones.length > 0 && (
        <table data-testid="zone-table" className="zone-table">
          <thead>
            <tr>
              <th>作业区</th>
              <th>范围 (mm)</th>
              <th>覆盖 (mm)</th>
              <th>覆盖率</th>
            </tr>
          </thead>
          <tbody>
            {result.zones.map((zone) => (
              <tr
                key={zone.index}
                data-testid={`zone-row-${zone.index}`}
                className={
                  selectedZone === zone.index ? "zone-selected" : undefined
                }
              >
                <td>{zone.index + 1}</td>
                <td>
                  [{zone.start}, {zone.end})
                </td>
                <td>{zone.covered_mm}</td>
                <td>{zone.coverage_ratio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
