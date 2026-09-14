import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs";

// 真实联调：浏览器打真实 Web 容器，request 直接打真实 API 容器，两边比对。
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

const DEFECTS: Row[] = [
  { start: "10", end: "20" },
  { start: "15", end: "30" },
  { start: "500", end: "600" },
  { start: "900", end: "950" },
];

const EXPECTED_MERGED = [
  { start: 10, end: 30 },
  { start: 500, end: 600 },
  { start: 900, end: 950 },
];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("页面汇总、带状图、下载文件与 API 结果完全一致", async ({
  page,
  request,
}) => {
  await page.getByTestId("roll-length-input").fill("1000");
  await fillDefects(page, DEFECTS);
  await page.getByTestId("submit-button").click();

  // 同一载荷直接打真实 API，作为页面比对的基准
  const apiResp = await request.post(`${API}/api/merge`, {
    data: {
      roll_length: 1000,
      defects: DEFECTS.map((d) => ({
        start: Number(d.start),
        end: Number(d.end),
      })),
    },
  });
  expect(apiResp.ok()).toBeTruthy();
  const apiJson = await apiResp.json();
  expect(apiJson.merged).toEqual(EXPECTED_MERGED);

  // 汇总值一致
  await expect(page.getByTestId("summary-covered")).toHaveText(
    String(apiJson.covered_mm),
  );
  await expect(page.getByTestId("summary-ratio")).toHaveText(
    String(apiJson.coverage_ratio),
  );
  await expect(page.getByTestId("summary-count")).toHaveText(
    String(apiJson.merged.length),
  );

  // 逐段边界一致
  const items = page.getByTestId("segment-item");
  await expect(items).toHaveCount(apiJson.merged.length);
  for (const [i, seg] of apiJson.merged.entries()) {
    await expect(items.nth(i)).toContainText(`[${seg.start}, ${seg.end}]`);
  }

  // 带状图矩形数量与边界一致
  const rects = page.getByTestId("merged-rect");
  await expect(rects).toHaveCount(apiJson.merged.length);
  for (const [i, seg] of apiJson.merged.entries()) {
    const expectedX = (seg.start / apiJson.roll_length) * 1000;
    const expectedW = ((seg.end - seg.start) / apiJson.roll_length) * 1000;
    await expect(rects.nth(i)).toHaveAttribute("x", String(expectedX));
    await expect(rects.nth(i)).toHaveAttribute("width", String(expectedW));
  }

  // 下载文件与 API 结果逐字节同内容
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  const path = await download.path();
  const downloaded = JSON.parse(fs.readFileSync(path!, "utf-8"));
  expect(downloaded).toEqual(apiJson);
});

test("越界行使整次提交失败：清空旧图并定位行号", async ({ page }) => {
  // 先拿到一张有效图
  await page.getByTestId("roll-length-input").fill("1000");
  await fillDefects(page, [{ start: "10", end: "20" }]);
  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("band-chart")).toBeVisible();

  // 追加一行越界缺陷（终点 1200 > 卷长 1000）
  await page.getByTestId("add-row").click();
  await page.getByTestId("start-input-1").fill("900");
  await page.getByTestId("end-input-1").fill("1200");
  await page.getByTestId("submit-button").click();

  await expect(page.getByTestId("error-banner")).toBeVisible();
  await expect(page.getByTestId("error-item").first()).toContainText("第 2 行");
  // 旧图与旧汇总被清空
  await expect(page.getByTestId("band-chart")).toHaveCount(0);
  await expect(page.getByTestId("summary")).toHaveCount(0);
  await expect(page.getByTestId("download-button")).toHaveCount(0);
});

test("非整数与空列表同样使整次提交失败", async ({ page }) => {
  await page.getByTestId("roll-length-input").fill("1000");
  await fillDefects(page, [{ start: "abc", end: "20" }]);
  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("error-banner")).toContainText("第 1 行");
  await expect(page.getByTestId("band-chart")).toHaveCount(0);

  // 删除所有行 → 空列表
  await page.getByTestId("remove-row-0").click();
  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("error-banner")).toContainText(
    "缺陷列表不能为空",
  );
});

test("输入顺序不影响页面输出", async ({ page }) => {
  const orderA: Row[] = [
    { start: "500", end: "600" },
    { start: "10", end: "20" },
    { start: "15", end: "30" },
  ];
  const orderB: Row[] = [...orderA].reverse();

  await page.getByTestId("roll-length-input").fill("1000");
  await fillDefects(page, orderA);
  await page.getByTestId("submit-button").click();
  const segmentsA = await page.getByTestId("segment-item").allTextContents();

  await page.reload();
  await page.getByTestId("roll-length-input").fill("1000");
  await fillDefects(page, orderB);
  await page.getByTestId("submit-button").click();
  const segmentsB = await page.getByTestId("segment-item").allTextContents();

  expect(segmentsA).toEqual(segmentsB);
});

test("API：乱序输入返回相同结果，闭区间相接必合并", async ({ request }) => {
  const base = [
    { start: 10, end: 20 },
    { start: 20, end: 40 },
    { start: 500, end: 600 },
  ];
  const respA = await request.post(`${API}/api/merge`, {
    data: { roll_length: 1000, defects: base },
  });
  const respB = await request.post(`${API}/api/merge`, {
    data: { roll_length: 1000, defects: [...base].reverse() },
  });
  expect(respA.ok()).toBeTruthy();
  expect(respB.ok()).toBeTruthy();
  const jsonA = await respA.json();
  expect(await respB.json()).toEqual(jsonA);
  // 闭区间：20 相接，合并为 [10, 40]
  expect(jsonA.merged).toEqual([
    { start: 10, end: 40 },
    { start: 500, end: 600 },
  ]);
  expect(jsonA.covered_mm).toBe(130);
  expect(jsonA.coverage_ratio).toBe(0.13);
});
