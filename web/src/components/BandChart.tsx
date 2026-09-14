import type { Segment } from "../types";

const WIDTH = 1000;
const LANE_HEIGHT = 26;
const RAW_Y = 36;
const MERGED_Y = 96;
const HEIGHT = 176;

interface Props {
  rollLength: number;
  defects: Segment[];
  merged: Segment[];
}

/**
 * 线性带状图：上行原始缺陷，下行合并返工段。
 * 合并段的 x/width 与起止标签直接由 API 结果换算，
 * 与汇总值、下载文件呈现完全相同的返工边界。
 */
export function BandChart({ rollLength, defects, merged }: Props) {
  const x = (value: number) => (value / rollLength) * WIDTH;
  const width = (seg: Segment) =>
    Math.max(((seg.end - seg.start) / rollLength) * WIDTH, 0.5);
  const sortedDefects = [...defects].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );

  return (
    <svg
      data-testid="band-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="band-chart"
      role="img"
      aria-label="返工段线性带状图"
    >
      <text x={0} y={12} className="axis-label" textAnchor="start">
        0
      </text>
      <text x={WIDTH} y={12} className="axis-label" textAnchor="end">
        {rollLength} mm
      </text>

      <text x={0} y={RAW_Y - 8} className="lane-label">
        原始缺陷（{sortedDefects.length} 段）
      </text>
      <rect x={0} y={RAW_Y} width={WIDTH} height={LANE_HEIGHT} className="track" />
      {sortedDefects.map((seg, i) => (
        <rect
          key={i}
          data-testid="defect-rect"
          className="defect"
          x={x(seg.start)}
          y={RAW_Y}
          width={width(seg)}
          height={LANE_HEIGHT}
        >
          <title>{`缺陷 [${seg.start}, ${seg.end}]`}</title>
        </rect>
      ))}

      <text x={0} y={MERGED_Y - 8} className="lane-label">
        合并返工（{merged.length} 段）
      </text>
      <rect
        x={0}
        y={MERGED_Y}
        width={WIDTH}
        height={LANE_HEIGHT}
        className="track"
      />
      {merged.map((seg, i) => (
        <g key={i}>
          <rect
            data-testid="merged-rect"
            className="merged"
            x={x(seg.start)}
            y={MERGED_Y}
            width={width(seg)}
            height={LANE_HEIGHT}
          >
            <title>{`返工 [${seg.start}, ${seg.end}]`}</title>
          </rect>
          <text
            x={x(seg.start)}
            y={MERGED_Y + LANE_HEIGHT + 16}
            className="seg-label"
            textAnchor="middle"
          >
            {seg.start}
          </text>
          <text
            x={x(seg.end)}
            y={MERGED_Y + LANE_HEIGHT + 32}
            className="seg-label seg-label-end"
            textAnchor="middle"
          >
            {seg.end}
          </text>
        </g>
      ))}
    </svg>
  );
}
