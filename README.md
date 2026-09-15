# 卷材返工段审查器

印刷卷材下线后，检测员记录的油墨脱落区常彼此重叠或首尾相接。本系统把若干缺陷区间归并为**唯一的合并返工段**，避免设备重复走带、夸大报废长度：

- **Web（React + Vite）**：表格录入卷长与缺陷区间，可选填写作业区长度、成对填写最大行程与完好材料容限；提交后绘制线性带状图、展示汇总值与逐区覆盖明细，并可下载同内容 JSON。
- **API（FastAPI）**：校验 → 归并 → 返回合并段、覆盖毫米数、覆盖率；携带作业区长度时额外按半开作业区切分，逐区返回覆盖明细；成对携带最大行程与完好材料容限时额外在唯一合并段上规划穿带执行段。前端不做任何本地归并，唯一真值来源是 `POST /api/merge`（无假接口）。
- **verify（一次性验收服务）**：依次运行 pytest、Vitest、Playwright，全部通过才以 0 退出。

## 快速启动（Docker Compose）

```bash
docker compose up --build
```

- Web：<http://localhost:8080>
- API：<http://localhost:8000>（文档：<http://localhost:8000/docs>）

宿主端口可用环境变量覆盖：

```bash
WEB_PORT=9000 API_PORT=9001 docker compose up --build
```

## 一键验收

```bash
docker compose --profile verify up --build --exit-code-from verify
```

`verify` 服务等待 Web/API 健康后依次执行：

1. `pytest`：归并算法独立判据 + API 契约（`api/tests/`）；
2. `vitest run`：前端单元与组件测试（`web/src/**/*.test.*`）；
3. `playwright test`：真实联调——浏览器操作真实 Web 容器，`request` 直打真实 API 容器，断言**页面汇总、带状图矩形、下载 JSON 与 API 响应完全一致**（`web/e2e/`）。

任一环节失败，`verify` 以非零码退出，`--exit-code-from verify` 会把该退出码传给命令本身。

就绪链路：`api` 健康（`GET http://127.0.0.1:8000/api/health`）→ `web` 健康（`GET http://127.0.0.1/`）→ `verify` 自动跑完全部检查。健康检查一律使用 `127.0.0.1` 而非 `localhost`：容器内 `localhost` 优先解析为 `::1`，而 nginx:alpine 的 busybox wget 只连接第一个解析结果、nginx 仅监听 IPv4，用 `localhost` 会使 web 永远不健康、验收无法开始。

## 区间规则

- 所有长度与端点均为**整数毫米**；卷长范围 **1 ≤ 卷长 ≤ 1 000 000**。
- 每条缺陷必须满足 **0 ≤ 起点 < 终点 ≤ 卷长**。
- 区间按**闭区间**处理：排序后若**后一段起点 ≤ 当前段终点**，两段必须合并（首尾相接也算重叠）。
- 输出按**起点升序**；**输入顺序不影响输出**（归并前先排序）。
- **覆盖长度** = 各合并段「终点 − 起点」之和。
- **覆盖率** = 覆盖长度 ÷ 卷长，**四舍五入（ROUND_HALF_UP）到小数点后两位**（如 0.125 → 0.13）。
- **空缺陷列表、非整数（含小数、字符串、布尔）、越界项**中的任何一项都使**整次提交失败**：API 返回 422 与全部错误的行号，前端清空旧图并在表格中定位出错行。

### 作业区（可选）

- 表单中的**作业区长度**为可选项；留空时请求不携带 `zone_length`，响应保持原结构（无 `zones` 字段），现有图表与下载内容不受影响。
- 填写后，卷材按**从零开始的半开作业区** `[0, L) [L, 2L) …` 切分，**末区可短于设定长度**；**端点落在分界线时只计入右侧作业区**。
- 每区**覆盖毫米数** = 合并返工段与该区的区间交集长度；每区**覆盖率** = 该区覆盖 ÷ 该区**实际长度**，同样四舍五入（ROUND_HALF_UP）到两位小数。各作业区覆盖之和恒等于整卷覆盖长度。
- 作业区长度必须为整数且满足 **1 ≤ 作业区长度 ≤ 卷长**，否则整次提交失败：API 返回指向 `zone_length` 字段的 422，页面清空本次旧结果并聚焦该输入框。
- 汇总表与带状图共用响应中的作业区边界；在图上点选某区时表格高亮对应行（再次点击取消），原始缺陷与合并返工车道保持不变。

```json
// POST /api/merge
{
  "roll_length": 1000,
  "zone_length": 400,
  "defects": [
    { "start": 100, "end": 500 },
    { "start": 850, "end": 950 }
  ]
}
```

```json
// 200 OK（节选）：zones 逐区明细，末区 [800, 1000) 短于设定长度
{
  "roll_length": 1000,
  "merged": [
    { "start": 100, "end": 500 },
    { "start": 850, "end": 950 }
  ],
  "covered_mm": 500,
  "coverage_ratio": 0.5,
  "zones": [
    { "index": 0, "start": 0, "end": 400, "covered_mm": 300, "coverage_ratio": 0.75 },
    { "index": 1, "start": 400, "end": 800, "covered_mm": 100, "coverage_ratio": 0.25 },
    { "index": 2, "start": 800, "end": 1000, "covered_mm": 100, "coverage_ratio": 0.5 }
  ]
}
```

### 穿带排程（可选，成对字段）

返工机台需减少穿带次数：把相邻的**唯一合并返工段**划为连续分组，每组一次穿带执行（执行段 `[首段起点, 末段终点]`），一次执行会把组内缺陷段之外的完好材料间隙也带上。

- 表单中的**最大行程**与**完好材料容限**是一对可选项：**必须同时留空或同时填写**；留空时请求不携带这两个字段，响应、作业区、图表与下载内容保持原状。
- 每个执行段的**跨度（终点 − 起点）不超过最大行程**；所有执行段带入的**完好材料总和不超过整卷容限**。
- 唯一方案依次按决胜规则确定：**执行段最少 → 完好材料更少 → 终点序列字典序更小**。
- **零容限**时任何间隙都不能跨越，各合并段独立执行。
- 任一合并段自身跨度超过最大行程时**无法排程**：HTTP 仍为 200，响应不含 `executions`，改在 `scheduling.segments` 中返回全部越界合并段的边界（`good_mm_total` 恒为 0，即零容限独立执行的完好材料基线）；页面清空本次旧结果，错误横幅逐段列出边界，并聚焦**最大行程**输入框。
- 两项分析可同时使用：排程只读取合并段，不改写 `merged` 边界、覆盖账目与 `zones` 明细。
- 最大行程必须为整数且 **1 ≤ 最大行程 ≤ 卷长**；完好材料容限必须为整数且 **0 ≤ 容限 ≤ 卷长**。只填一个字段（或填非整数、越界）都使整次提交失败：422 错误同时指向 `max_travel` 与 `sound_tolerance` 两个表单字段；多项错误按「表单字段（`roll_length`、`zone_length`、`max_travel`、`sound_tolerance`）→ 缺陷输入行」的顺序稳定返回。

```json
// POST /api/merge
{
  "roll_length": 500,
  "max_travel": 200,
  "sound_tolerance": 2,
  "defects": [
    { "start": 0, "end": 100 },
    { "start": 101, "end": 200 },
    { "start": 300, "end": 400 },
    { "start": 401, "end": 500 }
  ]
}
```

```json
// 200 OK：四个分离段，中间 99 mm 间隙阻断两侧合并，全局最优为两次执行
{
  "roll_length": 500,
  "merged": [
    { "start": 0, "end": 100 },
    { "start": 101, "end": 200 },
    { "start": 300, "end": 400 },
    { "start": 401, "end": 500 }
  ],
  "covered_mm": 398,
  "coverage_ratio": 0.8,
  "executions": [
    { "start": 0, "end": 200, "good_mm": 1 },
    { "start": 300, "end": 500, "good_mm": 1 }
  ]
}
```

无法排程时（最大行程 100，合并段 `[300, 500]` 跨度 200）：

```json
{
  "roll_length": 1000,
  "merged": [ ... ],
  "covered_mm": 220,
  "coverage_ratio": 0.22,
  "scheduling": {
    "feasible": false,
    "segments": [{ "start": 300, "end": 500 }],
    "good_mm_total": 0
  }
}
```

### 示例

```json
// POST /api/merge
{
  "roll_length": 1000,
  "defects": [
    { "start": 500, "end": 600 },
    { "start": 15, "end": 30 },
    { "start": 10, "end": 20 }
  ]
}
```

```json
// 200 OK
{
  "roll_length": 1000,
  "merged": [
    { "start": 10, "end": 30 },
    { "start": 500, "end": 600 }
  ],
  "covered_mm": 120,
  "coverage_ratio": 0.12
}
```

### 错误响应（422）

```json
{
  "detail": {
    "message": "输入校验失败，整次提交未执行",
    "errors": [
      { "row": 2, "field": "end", "message": "终点不能超过卷长 1000 毫米" }
    ]
  }
}
```

`row` 为缺陷列表的 0 基下标（页面显示为 1 基行号），`row: null` 表示卷长或列表级错误。

## 一致性保证

页面汇总、带状图、下载的 `rework-result.json` 三者渲染自**同一份 API 响应对象**，因此呈现完全相同的返工边界；Playwright 用例对此逐段、逐矩形、逐字节断言。

## 本地开发

```bash
# API（http://localhost:8000）
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload
python -m pytest            # 后端测试

# Web（http://localhost:5173，/api 已代理到 8000）
cd web
npm ci
npm run dev
npm run test                # Vitest
npm run typecheck           # tsc
npm run test:e2e            # Playwright（需 Compose 栈已启动，占用 8080/8000）
```

## 目录结构

```
├── docker-compose.yml      # web + api + verify（一次性验收，profile: verify）
├── api/
│   ├── app/
│   │   ├── main.py         # FastAPI 入口：/api/health、/api/merge
│   │   ├── merge.py        # 闭区间归并、覆盖长度、覆盖率（ROUND_HALF_UP）、作业区切分、穿带排程
│   │   ├── validation.py   # 整次校验，错误携带行号与表单字段
│   │   └── schemas.py      # 响应模型（含执行段与无法排程说明）
│   └── tests/              # pytest：算法独立判据 + API 契约
├── web/
│   ├── src/                # React 应用（表格、带状图、汇总、下载）
│   ├── e2e/                # Playwright 真实联调
│   └── nginx.conf          # 静态托管 + /api 同源反代
└── verify/                 # 一次性验收服务（pytest → Vitest → Playwright）
```
