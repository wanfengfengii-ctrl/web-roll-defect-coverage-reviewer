import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs";

// 真实联调：浏览器打真实 Web 容器，request 直接打真实 API 容器。
// 断言真实提交中 API 响应、页面汇总、带状图执行段与下载 JSON 完全一致。
const API = process.env.API_BASE_URL ?? "http://localhost:8000";

interface Row {
  start: string;
  end: string;
}

async function fillDefects(page: Page, rows: Row[]) {
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) await page.getByTestId("add-row").click();
    await page.getByTestId(`start-input-${i}`).fill(rows[i].start);
    await page.getByTestId(`end-input-${i}`).fill(rows[i].end);
  }
}

// 四个分离段：外侧间隙 1 mm，中间隙 100 mm
const FOUR_SEGMENTS: Row[] = [
  { start: "0", end: "100" },
  { start: "101", end: "200" },
  { start: "300", end: "400" },
  { start: "401", end: "500" },
];

const EXPECTED_MERGED = [
  { start: 0, end: 100 },
  { start: 101, end: 200 },
  { start: 300, end: 400 },
  { start: 401, end: 500 },
];

const EXPECTED_EXECUTIONS = [
  { start: 0, end: 200, good_mm: 1 },
  { start: 300, end: 500, good_mm: 1 },
];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("四个分离段中间隙阻断：API、汇总、带状图与下载 JSON 的执行段完全一致", async ({
  page,
  request,
}) => {
  await page.getByTestId("roll-length-input").fill("500");
  await page.getByTestId("max-travel-input").fill("200");
  await page.getByTestId("sound-tolerance-input").fill("2");
  await fillDefects(page, FOUR_SEGMENTS);
  await page.getByTestId("submit-button").click();

  // 同一载荷直接打真实 API，作为页面比对的基准
  const apiResp = await request.post(`${API}/api/merge`, {
    data: {
      roll_length: 500,
      max_travel: 200,
      sound_tolerance: 2,
      defects: EXPECTED_MERGED,
    },
  });
  expect(apiResp.ok()).toBeTruthy();
  const apiJson = await apiResp.json();
  // 唯一合并返工段与覆盖账目不因排程分析改写
  expect(apiJson.merged).toEqual(EXPECTED_MERGED);
  expect(apiJson.covered_mm).toBe(398);
  expect(apiJson).not.toHaveProperty("zones");
  expect(apiJson).not.toHaveProperty("scheduling");
  // 全局最优：两次执行，中间隙不跨，各带入 1 mm 完好材料
  expect(apiJson.executions).toEqual(EXPECTED_EXECUTIONS);

  // 汇总区执行段与完好材料毫米数
  await expect(page.getByTestId("execution-count")).toHaveText("2");
  await expect(page.getByTestId("execution-good-total")).toHaveText("2");
  const items = page.getByTestId("execution-item");
  await expect(items).toHaveCount(2);
  for (const [i, run] of apiJson.executions.entries()) {
    await expect(items.nth(i)).toContainText(`[${run.start}, ${run.end}]`);
    await expect(items.nth(i)).toContainText(`完好材料`);
  }

  // 合并段仍为四段，未被排程改写
  await expect(page.getByTestId("merged-rect")).toHaveCount(4);

  // 带状图执行段矩形边界与完好材料毫米数
  const execRects = page.getByTestId("execution-rect");
  await expect(execRects).toHaveCount(2);
  for (const [i, run] of apiJson.executions.entries()) {
    await expect(execRects.nth(i)).toHaveAttribute(
      "x",
      String((run.start / 500) * 1000),
    );
    await expect(execRects.nth(i)).toHaveAttribute(
      "width",
      String(((run.end - run.start) / 500) * 1000),
    );
    await expect(execRects.nth(i)).toHaveAttribute(
      "data-good-mm",
      String(run.good_mm),
    );
  }

  // 下载文件与 API 结果逐字节同内容（含 executions）
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  const path = await download.path();
  const downloaded = JSON.parse(fs.readFileSync(path!, "utf-8"));
  expect(downloaded).toEqual(apiJson);
});

test("零容限：各合并段独立执行，每段完好材料均为 0", async ({
  page,
  request,
}) => {
  const apiResp = await request.post(`${API}/api/merge`, {
    data: {
      roll_length: 500,
      max_travel: 500,
      sound_tolerance: 0,
      defects: EXPECTED_MERGED,
    },
  });
  expect(apiResp.ok()).toBeTruthy();
  const apiJson = await apiResp.json();
  expect(apiJson.executions).toEqual([
    { start: 0, end: 100, good_mm: 0 },
    { start: 101, end: 200, good_mm: 0 },
    { start: 300, end: 400, good_mm: 0 },
    { start: 401, end: 500, good_mm: 0 },
  ]);

  await page.getByTestId("roll-length-input").fill("500");
  await page.getByTestId("max-travel-input").fill("500");
  await page.getByTestId("sound-tolerance-input").fill("0");
  await fillDefects(page, FOUR_SEGMENTS);
  await page.getByTestId("submit-button").click();

  await expect(page.getByTestId("execution-item")).toHaveCount(4);
  await expect(page.getByTestId("execution-good-total")).toHaveText("0");
  await expect(page.getByTestId("execution-rect")).toHaveCount(4);
});

test("合并段超过最大行程：清空旧结果、按边界报错并聚焦最大行程", async ({
  page,
  request,
}) => {
  // 真实 API 直接确认 scheduling 结构与越界段边界
  const apiResp = await request.post(`${API}/api/merge`, {
    data: {
      roll_length: 1000,
      max_travel: 100,
      sound_tolerance: 50,
      defects: [
        { start: 0, end: 20 },
        { start: 300, end: 500 },
        { start: 800, end: 850 },
      ],
    },
  });
  const apiJson = await apiResp.json();
  expect(apiJson).not.toHaveProperty("executions");
  expect(apiJson.scheduling.feasible).toBe(false);
  expect(apiJson.scheduling.segments).toEqual([{ start: 300, end: 500 }]);

  // 页面先拿到一张有效图
  await page.getByTestId("roll-length-input").fill("1000");
  await page.getByTestId("max-travel-input").fill("500");
  await page.getByTestId("sound-tolerance-input").fill("50");
  await fillDefects(page, [
    { start: "0", end: "20" },
    { start: "300", end: "500" },
    { start: "800", end: "850" },
  ]);
  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("band-chart")).toBeVisible();
  // 容限 50 不允许跨越 280 mm 间隙 → 三个合并段各自独立执行
  await expect(page.getByTestId("execution-rect")).toHaveCount(3);

  // 缩小最大行程 → 无法排程：清空本次旧结果，按越界段边界报错并聚焦
  await page.getByTestId("max-travel-input").fill("100");
  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("error-banner")).toBeVisible();
  await expect(page.getByTestId("error-banner")).toContainText(
    "返工段 [300, 500] 跨度 200 mm 超过最大行程 100 mm",
  );
  await expect(page.getByTestId("band-chart")).toHaveCount(0);
  await expect(page.getByTestId("summary")).toHaveCount(0);
  await expect(page.getByTestId("execution-summary")).toHaveCount(0);
  await expect(page.getByTestId("download-button")).toHaveCount(0);
  await expect(page.getByTestId("max-travel-input")).toBeFocused();
});

test("只填一个排程字段：两个字段均有反馈，旧结果清空并聚焦最大行程", async ({
  page,
}) => {
  // 先得到有效结果
  await page.getByTestId("roll-length-input").fill("1000");
  await page.getByTestId("max-travel-input").fill("500");
  await page.getByTestId("sound-tolerance-input").fill("10");
  await fillDefects(page, [{ start: "0", end: "20" }]);
  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("execution-summary")).toBeVisible();

  // 清空容限、只留最大行程
  await page.getByTestId("sound-tolerance-input").fill("");
  await page.getByTestId("submit-button").click();

  await expect(page.getByTestId("error-banner")).toBeVisible();
  await expect(page.getByTestId("error-banner")).toContainText("必须同时填写");
  await expect(page.getByTestId("max-travel-input")).toHaveClass(/input-error/);
  await expect(page.getByTestId("sound-tolerance-input")).toHaveClass(
    /input-error/,
  );
  await expect(page.getByTestId("max-travel-input")).toBeFocused();
  await expect(page.getByTestId("band-chart")).toHaveCount(0);
});

test("排程与作业区两项分析同时使用：边界与覆盖账目互不改写", async ({
  page,
  request,
}) => {
  await page.getByTestId("roll-length-input").fill("500");
  await page.getByTestId("zone-length-input").fill("250");
  await page.getByTestId("max-travel-input").fill("200");
  await page.getByTestId("sound-tolerance-input").fill("2");
  await fillDefects(page, FOUR_SEGMENTS);
  await page.getByTestId("submit-button").click();

  const apiResp = await request.post(`${API}/api/merge`, {
    data: {
      roll_length: 500,
      zone_length: 250,
      max_travel: 200,
      sound_tolerance: 2,
      defects: EXPECTED_MERGED,
    },
  });
  const apiJson = await apiResp.json();
  expect(apiJson.zones).toEqual([
    { index: 0, start: 0, end: 250, covered_mm: 199, coverage_ratio: 0.8 },
    { index: 1, start: 250, end: 500, covered_mm: 199, coverage_ratio: 0.8 },
  ]);
  expect(apiJson.executions).toEqual(EXPECTED_EXECUTIONS);

  // 作业区表、带状图区块、执行段车道同时出现
  await expect(page.getByTestId("zone-table")).toBeVisible();
  await expect(page.getByTestId("zone-region")).toHaveCount(2);
  await expect(page.getByTestId("execution-rect")).toHaveCount(2);
  await expect(page.getByTestId("merged-rect")).toHaveCount(4);

  // 作业区覆盖之和恒等于整卷覆盖，执行段完好材料合计不受作业区影响
  await expect(page.getByTestId("execution-good-total")).toHaveText("2");
  const zoneCovered = await page
    .getByTestId("zone-table")
    .locator("tbody tr td:nth-child(3)")
    .allTextContents();
  expect(
    zoneCovered.reduce((sum, text) => sum + Number(text), 0),
  ).toBe(apiJson.covered_mm);

  // 下载 JSON 同时含 zones 与 executions，且与 API 完全一致
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  const downloaded = JSON.parse(
    fs.readFileSync((await download.path())!, "utf-8"),
  );
  expect(downloaded).toEqual(apiJson);
});

test("两个排程字段留空：响应、作业区、图表与下载保持原状", async ({
  page,
}) => {
  await page.getByTestId("roll-length-input").fill("500");
  await page.getByTestId("zone-length-input").fill("250");
  await fillDefects(page, FOUR_SEGMENTS);
  await page.getByTestId("submit-button").click();

  await expect(page.getByTestId("zone-table")).toBeVisible();
  await expect(page.getByTestId("execution-summary")).toHaveCount(0);
  await expect(page.getByTestId("execution-rect")).toHaveCount(0);
  // 图表高度保持原状（无执行段车道追加）
  await expect(page.getByTestId("band-chart")).toHaveAttribute(
    "viewBox",
    "0 0 1000 210",
  );
});
