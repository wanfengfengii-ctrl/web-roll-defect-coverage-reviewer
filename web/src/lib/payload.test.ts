import { describe, expect, test } from "vitest";

import { buildPayload, toIntOrRaw } from "./payload";

describe("toIntOrRaw", () => {
  test("整数字符串转为 number", () => {
    expect(toIntOrRaw("42")).toBe(42);
    expect(toIntOrRaw(" 1000 ")).toBe(1000);
    expect(toIntOrRaw("-3")).toBe(-3);
    expect(toIntOrRaw("0")).toBe(0);
  });

  test("非整数输入原样保留，交给 API 判定", () => {
    expect(toIntOrRaw("")).toBe("");
    expect(toIntOrRaw("abc")).toBe("abc");
    expect(toIntOrRaw("1.5")).toBe("1.5");
    expect(toIntOrRaw("1e3")).toBe("1e3");
    expect(toIntOrRaw("10px")).toBe("10px");
  });
});

describe("buildPayload", () => {
  test("生成 API 契约结构", () => {
    expect(
      buildPayload("1000", [
        { start: "10", end: "20" },
        { start: "abc", end: "" },
      ]),
    ).toEqual({
      roll_length: 1000,
      defects: [
        { start: 10, end: 20 },
        { start: "abc", end: "" },
      ],
    });
  });

  test("空行列表原样提交，由 API 拒绝", () => {
    expect(buildPayload("1000", [])).toEqual({
      roll_length: 1000,
      defects: [],
    });
  });
});
