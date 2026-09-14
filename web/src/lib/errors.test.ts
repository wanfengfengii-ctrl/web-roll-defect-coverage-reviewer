import { describe, expect, test } from "vitest";

import { ApiRequestError, normalizeApiErrors } from "./errors";

describe("normalizeApiErrors", () => {
  test("解析 422 detail.errors 并保留行号", () => {
    const err = new ApiRequestError(422, {
      detail: {
        message: "输入校验失败，整次提交未执行",
        errors: [
          { row: 2, field: "end", message: "终点不能超过卷长 1000 毫米" },
          { row: null, field: "defects", message: "缺陷列表不能为空" },
        ],
      },
    });
    expect(normalizeApiErrors(err)).toEqual([
      { row: 2, field: "end", message: "终点不能超过卷长 1000 毫米" },
      { row: null, field: "defects", message: "缺陷列表不能为空" },
    ]);
  });

  test("非约定结构时给出兜底错误", () => {
    expect(normalizeApiErrors(new ApiRequestError(500, null))).toHaveLength(1);
    expect(normalizeApiErrors(new Error("network down"))[0].message).toContain(
      "无法连接",
    );
  });
});
