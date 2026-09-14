import { useState } from "react";
import type { FormEvent } from "react";

import { postMerge } from "./api";
import { BandChart } from "./components/BandChart";
import { DefectTable } from "./components/DefectTable";
import { Summary } from "./components/Summary";
import { normalizeApiErrors } from "./lib/errors";
import { buildPayload } from "./lib/payload";
import type {
  ApiErrorItem,
  DefectRow,
  MergeResponse,
  Segment,
} from "./types";

export default function App() {
  const [rollLength, setRollLength] = useState("1000");
  const [rows, setRows] = useState<DefectRow[]>([{ start: "", end: "" }]);
  const [result, setResult] = useState<MergeResponse | null>(null);
  const [submittedDefects, setSubmittedDefects] = useState<Segment[]>([]);
  const [errors, setErrors] = useState<ApiErrorItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const errorRows = new Set(
    errors.filter((e) => e.row !== null).map((e) => e.row as number),
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const payload = buildPayload(rollLength, rows);
      const res = await postMerge(payload);
      // 校验已被 API 通过，payload.defects 必为整数区间
      setResult(res);
      setSubmittedDefects(payload.defects as Segment[]);
      setErrors([]);
    } catch (err) {
      // 整次提交失败：清空旧图与旧汇总，只展示本次错误
      setResult(null);
      setSubmittedDefects([]);
      setErrors(normalizeApiErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    // 下载内容就是渲染汇总与带状图所用的同一份 API 结果
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "rework-result.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container">
      <h1>卷材返工段审查器</h1>
      <p className="hint">
        闭区间规则：后一段起点 ≤ 当前段终点时合并；覆盖长度 = Σ(终点 −
        起点)；覆盖率 = 覆盖长度 ÷ 卷长，四舍五入到两位小数。
      </p>

      <form onSubmit={handleSubmit}>
        <label className="roll-length">
          卷材总长（mm，1–1000000）：
          <input
            data-testid="roll-length-input"
            value={rollLength}
            onChange={(e) => setRollLength(e.target.value)}
            inputMode="numeric"
          />
        </label>

        <DefectTable rows={rows} errorRows={errorRows} onChange={setRows} />

        <button
          type="submit"
          data-testid="submit-button"
          disabled={submitting}
        >
          {submitting ? "审查中…" : "提交审查"}
        </button>
      </form>

      {errors.length > 0 && (
        <div className="error-banner" data-testid="error-banner" role="alert">
          <strong>提交失败，请修正以下问题：</strong>
          <ul>
            {errors.map((err, i) => (
              <li key={i} data-testid="error-item">
                {err.row !== null ? `第 ${err.row + 1} 行：` : ""}
                {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <section className="result">
          <h2>审查结果</h2>
          <Summary result={result} />
          <BandChart
            rollLength={result.roll_length}
            defects={submittedDefects}
            merged={result.merged}
          />
          <button
            type="button"
            data-testid="download-button"
            onClick={handleDownload}
          >
            下载 JSON
          </button>
        </section>
      )}
    </main>
  );
}
