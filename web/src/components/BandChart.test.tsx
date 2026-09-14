import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BandChart } from "./BandChart";

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
});
