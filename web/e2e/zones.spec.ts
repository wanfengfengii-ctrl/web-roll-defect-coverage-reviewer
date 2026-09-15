import { expect, test } from "@playwright/test";
import fs from "node:fs";

// 真实联调：浏览器打真实 Web 容器，request 直接打真实 API 容器，两边比对。
const API = process.env.API_BASE_URL ?? "http://localhost:8000";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("跨越三个作业区：API 明细、表格高亮与图中边界来自同一结果", async ({
  page,
  request,
}) => {
  // 卷长 1000、作业区长度 400 → [0,400) [400,800) [800,1000)，末区较短；
  // 缺陷 [100,500] 横跨前两个作业区，[850,950] 落在短末区
  await page.getByTestId("roll-length-input").fill("1000");
  await page.getByTestId("zone-length-input").fill("400");
  await page.getByTestId("start-input-0").fill("100");
  await page.getByTestId("end-input-0").fill("500");
  await page.getByTestId("add-row").click();
  await page.getByTestId("start-input-1").fill("850");
  await page.getByTestId("end-input-1").fill("950");
  await page.getByTestId("submit-button").click();

  // 同一载荷直接打真实 API，作为页面比对的基准
  const apiResp = await request.post(`${API}/api/merge`, {
    data: {
      roll_length: 1000,
      zone_length: 400,
      defects: [
        { start: 100, end: 500 },
        { start: 850, end: 950 },
      ],
    },
  });
  expect(apiResp.ok()).toBeTruthy();
  const apiJson = await apiResp.json();
  expect(apiJson.zones).toHaveLength(3);
  // 末区短于设定长度
  expect(apiJson.zones[2].end - apiJson.zones[2].start).toBeLessThan(400);

  // 汇总表逐区明细与 API 一致
  for (const zone of apiJson.zones) {
    const row = page.getByTestId(`zone-row-${zone.index}`);
    await expect(row).toContainText(`[${zone.start}, ${zone.end})`);
    await expect(row).toContainText(String(zone.covered_mm));
    await expect(row).toContainText(String(zone.coverage_ratio));
  }

  // 图中分界线与 API 作业区边界一致（每区左界 + 末区右界）
  const expectedBoundaries = [
    ...apiJson.zones.map((z: { start: number }) => z.start),
    apiJson.zones[apiJson.zones.length - 1].end,
  ];
  const boundaries = page.getByTestId("zone-boundary");
  await expect(boundaries).toHaveCount(expectedBoundaries.length);
  for (const [i, boundary] of expectedBoundaries.entries()) {
    const expectedX = String((boundary / apiJson.roll_length) * 1000);
    await expect(boundaries.nth(i)).toHaveAttribute("x1", expectedX);
    await expect(boundaries.nth(i)).toHaveAttribute("x2", expectedX);
  }

  // 图上选中第 2 区 → 表格对应行高亮，原始缺陷与合并段保持不变
  await page.getByTestId("zone-region").nth(1).click();
  await expect(page.getByTestId("zone-row-1")).toHaveClass(/zone-selected/);
  await expect(page.getByTestId("zone-row-0")).not.toHaveClass(
    /zone-selected/,
  );
  await expect(page.getByTestId("zone-row-2")).not.toHaveClass(
    /zone-selected/,
  );
  await expect(page.getByTestId("defect-rect")).toHaveCount(2);
  await expect(page.getByTestId("merged-rect")).toHaveCount(
    apiJson.merged.length,
  );

  // 下载文件与 API 结果逐字节同内容（含 zones 明细）
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  const path = await download.path();
  const downloaded = JSON.parse(fs.readFileSync(path!, "utf-8"));
  expect(downloaded).toEqual(apiJson);
});

test("作业区长度非法：422 清空本次旧结果并聚焦输入框", async ({ page }) => {
  // 先拿到一份带作业区的有效结果
  await page.getByTestId("roll-length-input").fill("1000");
  await page.getByTestId("zone-length-input").fill("400");
  await page.getByTestId("start-input-0").fill("100");
  await page.getByTestId("end-input-0").fill("500");
  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("zone-table")).toBeVisible();

  // 作业区长度超出卷长 → 422，错误指向 zone_length
  await page.getByTestId("zone-length-input").fill("5000");
  await page.getByTestId("submit-button").click();

  await expect(page.getByTestId("error-banner")).toBeVisible();
  await expect(page.getByTestId("error-banner")).toContainText("作业区长度");
  // 本次旧结果全部清空
  await expect(page.getByTestId("band-chart")).toHaveCount(0);
  await expect(page.getByTestId("summary")).toHaveCount(0);
  await expect(page.getByTestId("zone-table")).toHaveCount(0);
  await expect(page.getByTestId("download-button")).toHaveCount(0);
  // 聚焦作业区长度输入框
  await expect(page.getByTestId("zone-length-input")).toBeFocused();
});

test("未填写作业区长度时响应无 zones，页面不渲染逐区表", async ({
  page,
  request,
}) => {
  await page.getByTestId("roll-length-input").fill("1000");
  await page.getByTestId("start-input-0").fill("10");
  await page.getByTestId("end-input-0").fill("20");
  await page.getByTestId("submit-button").click();

  const apiResp = await request.post(`${API}/api/merge`, {
    data: { roll_length: 1000, defects: [{ start: 10, end: 20 }] },
  });
  const apiJson = await apiResp.json();
  expect(apiJson).not.toHaveProperty("zones");

  await expect(page.getByTestId("band-chart")).toBeVisible();
  await expect(page.getByTestId("zone-table")).toHaveCount(0);
  await expect(page.getByTestId("zone-region")).toHaveCount(0);
  await expect(page.getByTestId("zone-boundary")).toHaveCount(0);
});
