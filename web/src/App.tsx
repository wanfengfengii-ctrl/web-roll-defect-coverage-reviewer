import { useRef, useState } from "react";
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
  const [zoneLength, setZoneLength] = useState("");
  const [maxTravel, setMaxTravel] = useState("");
  const [soundTolerance, setSoundTolerance] = useState("");
  const [rows, setRows] = useState<DefectRow[]>([{ start: "", end: "" }]);
  const [result, setResult] = useState<MergeResponse | null>(null);
  const [submittedDefects, setSubmittedDefects] = useState<Segment[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [errors, setErrors] = useState<ApiErrorItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const zoneInputRef = useRef<HTMLInputElement>(null);
  const maxTravelInputRef = useRef<HTMLInputElement>(null);

  const errorRows = new Set(
    errors.filter((e) => e.row !== null).map((e) => e.row as number),
  );
  const zoneHasError = errors.some((e) => e.field === "zone_length");
  const maxTravelHasError = errors.some((e) => e.field === "max_travel");
  const soundToleranceHasError = errors.some(
    (e) => e.field === "sound_tolerance",
  );

  function focusField(apiErrors: ApiErrorItem[]) {
    // 排程字段非法或无法排程时聚焦最大行程；作业区字段非法时聚焦作业区长度
    if (
      apiErrors.some(
        (e) => e.field === "max_travel" || e.field === "sound_tolerance",
      )
    ) {
      maxTravelInputRef.current?.focus();
    } else if (apiErrors.some((e) => e.field === "zone_length")) {
      zoneInputRef.current?.focus();
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const payload = buildPayload(
        rollLength,
        rows,
        zoneLength,
        maxTravel,
        soundTolerance,
      );
      const res = await postMerge(payload);
      // 校验已被 API 通过，payload.defects 必为整数区间
      if (res.scheduling && res.scheduling.feasible === false) {
        // 无法排程：清空旧图与旧汇总，按越界合并段边界给出错误并聚焦最大行程
        setResult(null);
        setSubmittedDefects([]);
        setSelectedZone(null);
        const limit = payload.max_travel;
        const schedulingErrors: ApiErrorItem[] =
          res.scheduling.segments.length === 0
            ? [
                {
                  row: null,
                  field: "max_travel",
                  message: "在给定最大行程与完好材料容限下无法排程",
                },
              ]
            : res.scheduling.segments.map((seg) => ({
                row: null,
                field: "max_travel",
                message:
                  `无法排程：返工段 [${seg.start}, ${seg.end}] 跨度 ` +
                  `${seg.end - seg.start} mm 超过最大行程 ${String(limit)} mm`,
              }));
        setErrors(schedulingErrors);
        focusField(schedulingErrors);
        return;
      }
      setResult(res);
      setSubmittedDefects(payload.defects as Segment[]);
      setSelectedZone(null);
      setErrors([]);
    } catch (err) {
      // 整次提交失败：清空旧图与旧汇总，只展示本次错误
      setResult(null);
      setSubmittedDefects([]);
      setSelectedZone(null);
      const apiErrors = normalizeApiErrors(err);
      setErrors(apiErrors);
      focusField(apiErrors);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectZone(index: number) {
    // 再次点击已选中的作业区则取消选择；选中不改变原始缺陷与合并段
    setSelectedZone((current) => (current === index ? null : index));
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
        填写作业区长度后，卷材按从零开始的半开作业区 [起点, 终点)
        切分，逐区统计覆盖明细，端点落在分界线时只计入右侧作业区。
        最大行程与完好材料容限须成对填写（或同时留空）：相邻返工段分组穿带，
        每次执行跨度不超过最大行程、带入的完好材料总和不超过容限。
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

        <label className="zone-length">
          作业区长度（mm，可选，1–卷长）：
          <input
            ref={zoneInputRef}
            data-testid="zone-length-input"
            className={zoneHasError ? "input-error" : undefined}
            value={zoneLength}
            onChange={(e) => setZoneLength(e.target.value)}
            inputMode="numeric"
            placeholder="留空则按整卷统计"
          />
        </label>

        <fieldset className="travel-fields">
          <legend>穿带排程（可选，两项须同时填写或同时留空）</legend>
          <label>
            最大行程（mm，1–卷长）：
            <input
              ref={maxTravelInputRef}
              data-testid="max-travel-input"
              className={maxTravelHasError ? "input-error" : undefined}
              value={maxTravel}
              onChange={(e) => setMaxTravel(e.target.value)}
              inputMode="numeric"
              placeholder="留空则不排程"
            />
          </label>
          <label>
            完好材料容限（mm，0–卷长）：
            <input
              data-testid="sound-tolerance-input"
              className={soundToleranceHasError ? "input-error" : undefined}
              value={soundTolerance}
              onChange={(e) => setSoundTolerance(e.target.value)}
              inputMode="numeric"
              placeholder="留空则不排程"
            />
          </label>
        </fieldset>

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
          <Summary result={result} selectedZone={selectedZone} />
          <BandChart
            rollLength={result.roll_length}
            defects={submittedDefects}
            merged={result.merged}
            zones={result.zones}
            executions={result.executions}
            selectedZone={selectedZone}
            onSelectZone={handleSelectZone}
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
