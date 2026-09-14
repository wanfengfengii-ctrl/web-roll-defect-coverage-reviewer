import type { DefectRow } from "../types";

interface Props {
  rows: DefectRow[];
  errorRows: ReadonlySet<number>;
  onChange: (rows: DefectRow[]) => void;
}

export function DefectTable({ rows, errorRows, onChange }: Props) {
  const update = (index: number, field: keyof DefectRow, value: string) =>
    onChange(
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  const remove = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, { start: "", end: "" }]);

  return (
    <div className="defect-table-wrap">
      <table className="defect-table">
        <thead>
          <tr>
            <th>行号</th>
            <th>起点 (mm)</th>
            <th>终点 (mm)</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              data-testid={`defect-row-${i}`}
              className={errorRows.has(i) ? "row-error" : undefined}
            >
              <td>{i + 1}</td>
              <td>
                <input
                  data-testid={`start-input-${i}`}
                  value={row.start}
                  onChange={(e) => update(i, "start", e.target.value)}
                  placeholder="0"
                  inputMode="numeric"
                />
              </td>
              <td>
                <input
                  data-testid={`end-input-${i}`}
                  value={row.end}
                  onChange={(e) => update(i, "end", e.target.value)}
                  placeholder="100"
                  inputMode="numeric"
                />
              </td>
              <td>
                <button
                  type="button"
                  data-testid={`remove-row-${i}`}
                  onClick={() => remove(i)}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-hint">
                暂无缺陷行，点击下方按钮添加
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <button type="button" data-testid="add-row" onClick={add}>
        添加缺陷行
      </button>
    </div>
  );
}
