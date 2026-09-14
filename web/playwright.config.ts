import { defineConfig, devices } from "@playwright/test";

// 端到端测试只打真实运行的 Web/API（Docker Compose 栈或本机端口映射），
// 不启动任何假接口。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.WEB_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
