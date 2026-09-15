import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { BandChart } from "./BandChart";
import type { ZoneCoverage } from "../types";

const ZONES: ZoneCoverage[] = [
  { index: 0, start: 0, end: 400, covered_mm: 300, coverage_ratio: 0.75 },
  { index: 1, start: 400, end: 800, covered_mm: 100, coverage_ratio: 0.25 },
  { index: 2, start: 800, end: 1000, covered_mm: 0, coverage_ratio: 0 },
];

describe("BandChart", () => {
  test("合并段矩形精确编码返工边界", () => {
    render(
      <BandChart
        rollLength={1000}
        defects={[
          { start: 10, end: 20 },
          { start: 15, end: 30 },
        ]}
        merged={[{ start: 10, end: 30 }]}
      />,
    );
    const rects = screen.getAllByTestId("merged-rect");
    expect(rects).toHaveLength(1);
    // x = 10 / 1000 * 1000，width = (30 - 10) / 1000 * 1000
    expect(rects[0]).toHaveAttribute("x", "10");
    expect(rects[0]).toHaveAttribute("width", "20");
  });

  test("原始缺陷按起点升序绘制，且每段一个矩形", () => {
    render(
      <BandChart
        rollLength={100}
        defects={[
          { start: 50, end: 60 },
          { start: 10, end: 20 },
        ]}
        merged={[
          { start: 10, end: 20 },
          { start: 50, end: 60 },
        ]}
      />,
    );
    expect(screen.getAllByTestId("defect-rect")).toHaveLength(2);
    expect(screen.getAllByTestId("merged-rect")).toHaveLength(2);
  });

  test("边界标签与合并段数值一致", () => {
    render(
      <BandChart
        rollLength={1000}
        defects={[{ start: 0, end: 1000 }]}
        merged={[{ start: 0, end: 1000 }]}
      />,
    );
    const chart = screen.getByTestId("band-chart");
    expect(chart).toHaveTextContent("0");
    expect(chart).toHaveTextContent("1000");
  });

  test("绘制作业区边界与可点选区块，选中回调区号", () => {
    const onSelectZone = vi.fn();
    render(
      <BandChart
        rollLength={1000}
        defects={[{ start: 100, end: 500 }]}
        merged={[{ start: 100, end: 500 }]}
        zones={ZONES}
        selectedZone={1}
        onSelectZone={onSelectZone}
      />,
    );
    // 边界线 = 每区左界 + 末区右界，位置由响应中的作业区边界换算
    const boundaries = screen.getAllByTestId("zone-boundary");
    expect(boundaries).toHaveLength(4);
    expect(boundaries[0]).toHaveAttribute("x1", "0");
    expect(boundaries[1]).toHaveAttribute("x1", "400");
    expect(boundaries[2]).toHaveAttribute("x1", "800");
    expect(boundaries[3]).toHaveAttribute("x1", "1000");
    // 选中区块带高亮样式，点击区块回调区号
    const regions = screen.getAllByTestId("zone-region");
    expect(regions).toHaveLength(3);
    expect(regions[1]).toHaveClass("zone-selected");
    fireEvent.click(regions[2]);
    expect(onSelectZone).toHaveBeenCalledWith(2);
  });

  test("未提供作业区时不渲染边界与区块，图表布局不变", () => {
    render(
      <BandChart
        rollLength={1000}
        defects={[{ start: 10, end: 20 }]}
        merged={[{ start: 10, end: 20 }]}
      />,
    );
    expect(screen.queryByTestId("zone-region")).not.toBeInTheDocument();
    expect(screen.queryByTestId("zone-boundary")).not.toBeInTheDocument();
    expect(screen.getByTestId("band-chart")).toHaveAttribute(
      "viewBox",
      "0 0 1000 176",
    );
  });
});
