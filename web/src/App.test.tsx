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

const RESULT_WITH_EXECUTIONS: MergeResponse = {
  roll_length: 500,
  merged: [
    { start: 0, end: 100 },
    { start: 101, end: 200 },
    { start: 300, end: 400 },
    { start: 401, end: 500 },
  ],
  covered_mm: 398,
  coverage_ratio: 0.8,
  executions: [
    { start: 0, end: 200, good_mm: 1 },
    { start: 300, end: 500, good_mm: 1 },
  ],
};

function fillBaseForm() {
  fireEvent.change(screen.getByTestId("roll-length-input"), {
    target: { value: "500" },
  });
  fireEvent.change(screen.getByTestId("start-input-0"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByTestId("end-input-0"), {
    target: { value: "100" },
  });
}

describe("App 穿带排程", () => {
  beforeEach(() => {
    mockedPostMerge.mockReset();
  });

  test("成对字段同时填写时随请求提交，汇总与带状图展示执行段及完好材料毫米数", async () => {
    mockedPostMerge.mockResolvedValue(RESULT_WITH_EXECUTIONS);
    render(<App />);
    fillBaseForm();
    fireEvent.change(screen.getByTestId("max-travel-input"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByTestId("sound-tolerance-input"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));

    expect(mockedPostMerge).toHaveBeenCalledWith({
      roll_length: 500,
      defects: [{ start: 0, end: 100 }],
      max_travel: 200,
      sound_tolerance: 2,
    });

    await screen.findByTestId("execution-summary");
    expect(screen.getByTestId("execution-count")).toHaveTextContent("2");
    expect(screen.getByTestId("execution-good-total")).toHaveTextContent("2");
    const items = screen.getAllByTestId("execution-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("[0, 200]");
    expect(items[0]).toHaveTextContent("完好材料");
    expect(items[0].querySelector('[data-testid="execution-good-mm"]')).toHaveTextContent("1");
    expect(items[1]).toHaveTextContent("[300, 500]");
    expect(items[1].querySelector('[data-testid="execution-good-mm"]')).toHaveTextContent("1");

    // 带状图新增执行段车道：矩形与完好材料标注来自同一响应
    const rects = screen.getAllByTestId("execution-rect");
    expect(rects).toHaveLength(2);
    expect(rects[0]).toHaveAttribute("x", "0");
    expect(rects[0]).toHaveAttribute("width", "400");
    expect(rects[0]).toHaveAttribute("data-good-mm", "1");
    expect(rects[1]).toHaveAttribute("x", "600");
    expect(rects[1]).toHaveAttribute("width", "400");
    const labels = screen.getAllByTestId("execution-good-label");
    expect(labels[0]).toHaveTextContent("完好 1 mm");
    expect(labels[1]).toHaveTextContent("完好 1 mm");
  });

  test("两个排程字段留空时请求与结果保持原状，不渲染执行段", async () => {
    mockedPostMerge.mockResolvedValue({
      roll_length: 500,
      merged: [{ start: 0, end: 100 }],
      covered_mm: 100,
      coverage_ratio: 0.2,
    });
    render(<App />);
    fillBaseForm();
    fireEvent.click(screen.getByTestId("submit-button"));

    expect(mockedPostMerge).toHaveBeenCalledWith({
      roll_length: 500,
      defects: [{ start: 0, end: 100 }],
    });
    await screen.findByTestId("band-chart");
    expect(screen.queryByTestId("execution-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("execution-rect")).not.toBeInTheDocument();
  });

  test("只填一个字段：422 在两个字段上给出反馈并聚焦最大行程", async () => {
    mockedPostMerge.mockRejectedValue(
      new ApiRequestError(422, {
        detail: {
          message: "输入校验失败，整次提交未执行",
          errors: [
            {
              row: null,
              field: "max_travel",
              message: "最大行程与完好材料容限必须同时填写；缺少完好材料容限",
            },
            {
              row: null,
              field: "sound_tolerance",
              message: "最大行程与完好材料容限必须同时填写；缺少完好材料容限",
            },
          ],
        },
      }),
    );
    render(<App />);
    fillBaseForm();
    fireEvent.change(screen.getByTestId("max-travel-input"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));

    await screen.findByTestId("error-banner");
    expect(screen.getByTestId("max-travel-input")).toHaveClass("input-error");
    expect(screen.getByTestId("sound-tolerance-input")).toHaveClass("input-error");
    expect(screen.getByTestId("max-travel-input")).toHaveFocus();
    expect(screen.queryByTestId("summary")).not.toBeInTheDocument();
  });

  test("排程字段越界：错误稳定指向字段，多错误时表单字段先于缺陷行", async () => {
    mockedPostMerge.mockRejectedValue(
      new ApiRequestError(422, {
        detail: {
          message: "输入校验失败，整次提交未执行",
          errors: [
            { row: null, field: "max_travel", message: "最大行程不能超过卷长 500 毫米" },
            { row: null, field: "sound_tolerance", message: "完好材料容限不能超过卷长 500 毫米" },
            { row: 0, field: "end", message: "终点不能超过卷长 500 毫米" },
          ],
        },
      }),
    );
    render(<App />);
    fillBaseForm();
    fireEvent.change(screen.getByTestId("max-travel-input"), {
      target: { value: "600" },
    });
    fireEvent.change(screen.getByTestId("sound-tolerance-input"), {
      target: { value: "900" },
    });
    fireEvent.change(screen.getByTestId("end-input-0"), {
      target: { value: "999" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));

    await screen.findByTestId("error-banner");
    const items = screen.getAllByTestId("error-item");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("最大行程不能超过卷长");
    expect(items[1]).toHaveTextContent("完好材料容限不能超过卷长");
    expect(items[2]).toHaveTextContent("第 1 行");
    expect(screen.getByTestId("max-travel-input")).toHaveFocus();
  });

  test("无法排程：清空旧结果、按越界段边界报错并聚焦最大行程", async () => {
    // 先得到一份带执行段的有效结果
    mockedPostMerge.mockResolvedValueOnce(RESULT_WITH_EXECUTIONS);
    render(<App />);
    fillBaseForm();
    fireEvent.change(screen.getByTestId("max-travel-input"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByTestId("sound-tolerance-input"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));
    await screen.findByTestId("execution-summary");

    // 缩小最大行程后，存在跨度 200 mm 的合并段 → API 返回 scheduling
    mockedPostMerge.mockResolvedValueOnce({
      roll_length: 500,
      merged: [{ start: 300, end: 500 }],
      covered_mm: 200,
      coverage_ratio: 0.4,
      scheduling: {
        feasible: false,
        segments: [{ start: 300, end: 500 }],
        good_mm_total: 0,
      },
    });
    fireEvent.change(screen.getByTestId("max-travel-input"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));

    await screen.findByTestId("error-banner");
    expect(screen.getByTestId("error-banner")).toHaveTextContent(
      "返工段 [300, 500] 跨度 200 mm 超过最大行程 100 mm",
    );
    // 旧结果（汇总、带状图、执行段、下载）全部清空
    expect(screen.queryByTestId("summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("band-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("execution-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("download-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("max-travel-input")).toHaveFocus();
  });
});
