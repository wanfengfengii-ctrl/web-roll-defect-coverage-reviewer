import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import App from "./App";
import { postMerge } from "./api";
import { ApiRequestError } from "./lib/errors";
import type { MergeResponse } from "./types";

vi.mock("./api", () => ({
  postMerge: vi.fn(),
}));

const mockedPostMerge = vi.mocked(postMerge);

const RESULT_WITH_ZONES: MergeResponse = {
  roll_length: 1000,
  merged: [
    { start: 100, end: 500 },
    { start: 850, end: 950 },
  ],
  covered_mm: 500,
  coverage_ratio: 0.5,
  zones: [
    { index: 0, start: 0, end: 400, covered_mm: 300, coverage_ratio: 0.75 },
    { index: 1, start: 400, end: 800, covered_mm: 100, coverage_ratio: 0.25 },
    { index: 2, start: 800, end: 1000, covered_mm: 100, coverage_ratio: 0.5 },
  ],
};

function fillAndSubmit(zoneLength: string) {
  fireEvent.change(screen.getByTestId("roll-length-input"), {
    target: { value: "1000" },
  });
  fireEvent.change(screen.getByTestId("zone-length-input"), {
    target: { value: zoneLength },
  });
  fireEvent.change(screen.getByTestId("start-input-0"), {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByTestId("end-input-0"), {
    target: { value: "500" },
  });
  fireEvent.click(screen.getByTestId("submit-button"));
}

describe("App 作业区联动", () => {
  beforeEach(() => {
    mockedPostMerge.mockReset();
  });

  test("提交时携带作业区长度，图上选中某区时表格高亮对应行", async () => {
    mockedPostMerge.mockResolvedValue(RESULT_WITH_ZONES);
    render(<App />);
    fillAndSubmit("400");

    // 请求载荷包含 zone_length
    expect(mockedPostMerge).toHaveBeenCalledWith({
      roll_length: 1000,
      defects: [{ start: 100, end: 500 }],
      zone_length: 400,
    });

    // 汇总表与带状图共用响应中的作业区边界
    await screen.findByTestId("zone-table");
    expect(screen.getByTestId("zone-row-0")).toHaveTextContent("[0, 400)");
    expect(screen.getAllByTestId("zone-region")).toHaveLength(3);
    expect(screen.getAllByTestId("zone-boundary")).toHaveLength(4);

    // 图上选中第 2 区 → 表格对应行高亮，原始缺陷与合并段保持不变
    fireEvent.click(screen.getAllByTestId("zone-region")[1]);
    expect(screen.getByTestId("zone-row-1")).toHaveClass("zone-selected");
    expect(screen.getByTestId("zone-row-0")).not.toHaveClass("zone-selected");
    expect(screen.getByTestId("zone-row-2")).not.toHaveClass("zone-selected");
    expect(screen.getAllByTestId("defect-rect")).toHaveLength(1);
    expect(screen.getAllByTestId("merged-rect")).toHaveLength(2);

    // 换选第 3 区，再点击取消选择
    fireEvent.click(screen.getAllByTestId("zone-region")[2]);
    expect(screen.getByTestId("zone-row-2")).toHaveClass("zone-selected");
    expect(screen.getByTestId("zone-row-1")).not.toHaveClass("zone-selected");
    fireEvent.click(screen.getAllByTestId("zone-region")[2]);
    expect(screen.getByTestId("zone-row-2")).not.toHaveClass("zone-selected");
  });

  test("作业区长度非法：422 清空本次旧结果并聚焦输入框", async () => {
    // 先拿到一份带作业区的有效结果
    mockedPostMerge.mockResolvedValueOnce(RESULT_WITH_ZONES);
    render(<App />);
    fillAndSubmit("400");
    await screen.findByTestId("zone-table");

    // 再提交非法作业区长度 → API 拒绝，错误指向 zone_length
    mockedPostMerge.mockRejectedValueOnce(
      new ApiRequestError(422, {
        detail: {
          message: "输入校验失败，整次提交未执行",
          errors: [
            {
              row: null,
              field: "zone_length",
              message: "作业区长度必须为整数毫米",
            },
          ],
        },
      }),
    );
    fireEvent.change(screen.getByTestId("zone-length-input"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));

    // 错误横幅展示，本次旧结果（汇总、逐区表、带状图、下载）全部清空
    await screen.findByTestId("error-banner");
    expect(screen.getByTestId("error-banner")).toHaveTextContent(
      "作业区长度必须为整数毫米",
    );
    expect(screen.queryByTestId("summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("zone-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("band-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("download-button")).not.toBeInTheDocument();
    // 聚焦作业区长度输入框
    expect(screen.getByTestId("zone-length-input")).toHaveFocus();
  });

  test("未填写作业区长度时请求不携带该字段，结果无逐区表", async () => {
    mockedPostMerge.mockResolvedValue({
      roll_length: 1000,
      merged: [{ start: 100, end: 500 }],
      covered_mm: 400,
      coverage_ratio: 0.4,
    });
    render(<App />);
    fillAndSubmit("");

    expect(mockedPostMerge).toHaveBeenCalledWith({
      roll_length: 1000,
      defects: [{ start: 100, end: 500 }],
    });
    await screen.findByTestId("band-chart");
    expect(screen.queryByTestId("zone-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("zone-region")).not.toBeInTheDocument();
  });
});
