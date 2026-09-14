#!/usr/bin/env bash
# 一次性验收：依次执行 pytest、Vitest、Playwright，任一失败即非零退出。
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"
WEB_BASE_URL="${WEB_BASE_URL:-http://127.0.0.1:8080}"

wait_for() {
  local url="$1" name="$2"
  echo "==> 等待 ${name} 就绪：${url}"
  for _ in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "    ${name} 已就绪"
      return 0
    fi
    sleep 1
  done
  echo "    ${name} 等待超时" >&2
  return 1
}

wait_for "${API_BASE_URL}/api/health" "API"
wait_for "${WEB_BASE_URL}/" "Web"

echo "==> [1/3] pytest：归并算法独立判据 + API 契约"
cd /verify/api
python -m pytest tests -v

echo "==> [2/3] Vitest：前端单元与组件测试"
cd /verify/web
npx vitest run

echo "==> [3/3] Playwright：页面 × API 真实联调"
cd /verify/web
WEB_BASE_URL="${WEB_BASE_URL}" API_BASE_URL="${API_BASE_URL}" npx playwright test

echo "==> 验收通过：带状图、汇总值与下载文件呈现完全相同的返工边界"
