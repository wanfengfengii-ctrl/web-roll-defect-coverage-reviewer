import type { Segment, ZoneCoverage } from "../types";

const WIDTH = 1000;
const LANE_HEIGHT = 26;
const RAW_Y = 36;
const MERGED_Y = 96;
const HEIGHT = 176;
// 提供作业区时，顶部插入一条作业区通道，其余车道整体下移
const ZONE_Y = 20;
const ZONE_LANE_HEIGHT = 22;
const ZONE_BLOCK = 34;

interface Props {
  rollLength: number;
  defects: Segment[];
  merged: Segment[];
  zones?: ZoneCoverage[];
  selectedZone?: number | null;
  onSelectZone?: (index: number) => void;
}

/**
 * 线性带状图：上行原始缺陷，下行合并返工段；
 * 请求携带作业区长度时，顶部增加一条可点选的作业区通道，
 * 并以虚线标出贯穿全图的分界线。所有边界均由同一份 API 结果换算，
 * 与汇总值、下载文件呈现完全相同的返工边界。
 */
export function BandChart({
  rollLength,
  defects,
  merged,
  zones,
  selectedZone = null,
  onSelectZone,
}: Props) {
  const zoneList = zones ?? [];
  const hasZones = zoneList.length > 0;
  const shift = hasZones ? ZONE_BLOCK : 0;
  const rawY = RAW_Y + shift;
  const mergedY = MERGED_Y + shift;
  const height = HEIGHT + shift;

  const x = (value: number) => (value / rollLength) * WIDTH;
  const width = (seg: Segment) =>
    Math.max(((seg.end - seg.start) / rollLength) * WIDTH, 0.5);
  const sortedDefects = [...defects].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );

  return (
    <svg
      data-testid="band-chart"
      viewBox={`0 0 ${WIDTH} ${height}`}
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

      {hasZones && (
        <>
          <text x={0} y={ZONE_Y - 4} className="lane-label">
            作业区（{zoneList.length} 区）
          </text>
          {zoneList.map((zone) => {
            const zoneWidth = Math.max(
              ((zone.end - zone.start) / rollLength) * WIDTH,
              0.5,
            );
            return (
              <g key={zone.index}>
                <rect
                  data-testid="zone-region"
                  data-zone-index={zone.index}
                  className={
                    selectedZone === zone.index ? "zone zone-selected" : "zone"
                  }
                  x={x(zone.start)}
                  y={ZONE_Y}
                  width={zoneWidth}
                  height={ZONE_LANE_HEIGHT}
                  onClick={() => onSelectZone?.(zone.index)}
                >
                  <title>{`作业区 ${zone.index + 1}：[${zone.start}, ${zone.end})`}</title>
                </rect>
                <text
                  x={x(zone.start) + zoneWidth / 2}
                  y={ZONE_Y + 15}
                  className="zone-label"
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {zone.index + 1}
                </text>
              </g>
            );
          })}
        </>
      )}

      <text x={0} y={rawY - 8} className="lane-label">
        原始缺陷（{sortedDefects.length} 段）
      </text>
      <rect x={0} y={rawY} width={WIDTH} height={LANE_HEIGHT} className="track" />
      {sortedDefects.map((seg, i) => (
        <rect
          key={i}
          data-testid="defect-rect"
          className="defect"
          x={x(seg.start)}
          y={rawY}
          width={width(seg)}
          height={LANE_HEIGHT}
        >
          <title>{`缺陷 [${seg.start}, ${seg.end}]`}</title>
        </rect>
      ))}

      <text x={0} y={mergedY - 8} className="lane-label">
        合并返工（{merged.length} 段）
      </text>
      <rect
        x={0}
        y={mergedY}
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
            y={mergedY}
            width={width(seg)}
            height={LANE_HEIGHT}
          >
            <title>{`返工 [${seg.start}, ${seg.end}]`}</title>
          </rect>
          <text
            x={x(seg.start)}
            y={mergedY + LANE_HEIGHT + 16}
            className="seg-label"
            textAnchor="middle"
          >
            {seg.start}
          </text>
          <text
            x={x(seg.end)}
            y={mergedY + LANE_HEIGHT + 32}
            className="seg-label seg-label-end"
            textAnchor="middle"
          >
            {seg.end}
          </text>
        </g>
      ))}

      {hasZones &&
        zoneList.map((zone) => (
          <g key={`boundary-${zone.index}`}>
            <line
              data-testid="zone-boundary"
              className="zone-boundary"
              x1={x(zone.start)}
              y1={ZONE_Y}
              x2={x(zone.start)}
              y2={mergedY + LANE_HEIGHT}
            />
            {zone.index === zoneList.length - 1 && (
              <line
                data-testid="zone-boundary"
                className="zone-boundary"
                x1={x(zone.end)}
                y1={ZONE_Y}
                x2={x(zone.end)}
                y2={mergedY + LANE_HEIGHT}
              />
            )}
          </g>
        ))}
    </svg>
  );
}
