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

  test("未提供排程时不渲染执行段车道，图表布局不变", () => {
    render(
      <BandChart
        rollLength={1000}
        defects={[{ start: 10, end: 20 }]}
        merged={[{ start: 10, end: 20 }]}
        zones={ZONES}
      />,
    );
    expect(screen.queryByTestId("execution-rect")).not.toBeInTheDocument();
    // 仅有作业区上移时，高度仍为 176 + 34
    expect(screen.getByTestId("band-chart")).toHaveAttribute(
      "viewBox",
      "0 0 1000 210",
    );
  });

  test("执行段矩形精确编码穿带边界并携带完好材料毫米数", () => {
    render(
      <BandChart
        rollLength={500}
        defects={[
          { start: 0, end: 100 },
          { start: 101, end: 200 },
          { start: 300, end: 400 },
          { start: 401, end: 500 },
        ]}
        merged={[
          { start: 0, end: 100 },
          { start: 101, end: 200 },
          { start: 300, end: 400 },
          { start: 401, end: 500 },
        ]}
        executions={[
          { start: 0, end: 200, good_mm: 1 },
          { start: 300, end: 500, good_mm: 1 },
        ]}
      />,
    );
    const rects = screen.getAllByTestId("execution-rect");
    expect(rects).toHaveLength(2);
    // x = start/500*1000，width = 跨度/500*1000
    expect(rects[0]).toHaveAttribute("x", "0");
    expect(rects[0]).toHaveAttribute("width", "400");
    expect(rects[0]).toHaveAttribute("data-good-mm", "1");
    expect(rects[1]).toHaveAttribute("x", "600");
    expect(rects[1]).toHaveAttribute("width", "400");
    expect(rects[1]).toHaveAttribute("data-good-mm", "1");
    const labels = screen.getAllByTestId("execution-good-label");
    expect(labels[0]).toHaveTextContent("完好 1 mm");
    expect(labels[1]).toHaveTextContent("完好 1 mm");
    // 追加执行段车道后画布增高 60
    expect(screen.getByTestId("band-chart")).toHaveAttribute(
      "viewBox",
      "0 0 1000 236",
    );
  });

  test("执行段与作业区可同时渲染，分界线贯穿到执行段车道", () => {
    render(
      <BandChart
        rollLength={500}
        defects={[{ start: 0, end: 100 }]}
        merged={[{ start: 0, end: 100 }]}
        zones={[
          { index: 0, start: 0, end: 250, covered_mm: 100, coverage_ratio: 0.4 },
          { index: 1, start: 250, end: 500, covered_mm: 0, coverage_ratio: 0 },
        ]}
        executions={[{ start: 0, end: 100, good_mm: 0 }]}
      />,
    );
    expect(screen.getAllByTestId("execution-rect")).toHaveLength(1);
    expect(screen.getAllByTestId("zone-region")).toHaveLength(2);
    // 分界线终点随执行段车道下移
    const boundaries = screen.getAllByTestId("zone-boundary");
    expect(boundaries[boundaries.length - 1]).toHaveAttribute(
      "y2",
      String(170 + 34 + 26),
    );
  });
});
