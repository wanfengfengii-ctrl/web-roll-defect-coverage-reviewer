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
});
