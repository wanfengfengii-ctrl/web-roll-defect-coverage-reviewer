import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Summary } from "./Summary";
import type { MergeResponse } from "../types";

const RESULT: MergeResponse = {
  roll_length: 1000,
  merged: [
    { start: 10, end: 30 },
    { start: 500, end: 600 },
  ],
  covered_mm: 120,
  coverage_ratio: 0.12,
};

describe("Summary", () => {
  test("呈现覆盖长度、覆盖率与段数", () => {
    render(<Summary result={RESULT} />);
    expect(screen.getByTestId("summary-covered")).toHaveTextContent("120");
    expect(screen.getByTestId("summary-ratio")).toHaveTextContent("0.12");
    expect(screen.getByTestId("summary-count")).toHaveTextContent("2");
  });

  test("逐段列出返工边界", () => {
    render(<Summary result={RESULT} />);
    const items = screen.getAllByTestId("segment-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("[10, 30]");
    expect(items[1]).toHaveTextContent("[500, 600]");
  });

  test("无作业区数据时不渲染逐区表", () => {
    render(<Summary result={RESULT} />);
    expect(screen.queryByTestId("zone-table")).not.toBeInTheDocument();
  });

  test("逐区列出覆盖明细并高亮选中行", () => {
    const withZones: MergeResponse = {
      ...RESULT,
      zones: [
        { index: 0, start: 0, end: 500, covered_mm: 20, coverage_ratio: 0.04 },
        { index: 1, start: 500, end: 1000, covered_mm: 100, coverage_ratio: 0.2 },
      ],
    };
    render(<Summary result={withZones} selectedZone={1} />);
    const row0 = screen.getByTestId("zone-row-0");
    const row1 = screen.getByTestId("zone-row-1");
    expect(row0).toHaveTextContent("[0, 500)");
    expect(row0).toHaveTextContent("20");
    expect(row1).toHaveTextContent("[500, 1000)");
    expect(row1).toHaveTextContent("0.2");
    expect(row1).toHaveClass("zone-selected");
    expect(row0).not.toHaveClass("zone-selected");
  });

  test("无排程数据时不渲染执行段汇总", () => {
    render(<Summary result={RESULT} />);
    expect(screen.queryByTestId("execution-summary")).not.toBeInTheDocument();
  });

  test("逐执行段列出跨度与完好材料毫米数及合计", () => {
    const withExecutions: MergeResponse = {
      ...RESULT,
      executions: [
        { start: 0, end: 200, good_mm: 1 },
        { start: 300, end: 500, good_mm: 6 },
      ],
    };
    render(<Summary result={withExecutions} />);
    expect(screen.getByTestId("execution-count")).toHaveTextContent("2");
    expect(screen.getByTestId("execution-good-total")).toHaveTextContent("7");
    const items = screen.getAllByTestId("execution-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("[0, 200]");
    expect(items[0]).toHaveTextContent("跨度 200 mm");
    expect(items[0].querySelector('[data-testid="execution-good-mm"]')).toHaveTextContent(
      "1",
    );
    expect(items[1]).toHaveTextContent("[300, 500]");
    expect(items[1].querySelector('[data-testid="execution-good-mm"]')).toHaveTextContent(
      "6",
    );
  });
});
