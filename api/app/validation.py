"""提交载荷校验。

任何空列表、非整数或越界项都使整次提交失败；
每个错误都携带行号（defects 的 0 基下标），便于前端定位表格行。
"""

from __future__ import annotations

from typing import Any

MIN_ROLL_LENGTH = 1
MAX_ROLL_LENGTH = 1_000_000

Error = dict[str, Any]


def _is_int(value: Any) -> bool:
    # bool 是 int 的子类，但 JSON 里的 true/false 不是合法毫米数
    return isinstance(value, int) and not isinstance(value, bool)


def _error(row: int | None, field: str | None, message: str) -> Error:
    return {"row": row, "field": field, "message": message}


def validate_payload(
    payload: Any,
) -> tuple[int | None, list[tuple[int, int]], int | None, list[Error]]:
    """校验整个提交。

    返回 (roll_length, defects, zone_length, errors)。errors 非空即整次失败，
    此时不得计算或返回任何归并结果。zone_length 为可选作业区长度：
    未提供时返回 None，请求与响应保持原结构。
    """
    errors: list[Error] = []
    roll_length: int | None = None
    zone_length: int | None = None
    defects: list[tuple[int, int]] = []

    if not isinstance(payload, dict):
        return None, [], None, [_error(None, None, "请求体必须为 JSON 对象")]

    raw_roll = payload.get("roll_length")
    if not _is_int(raw_roll):
        errors.append(_error(None, "roll_length", "卷长必须为整数毫米"))
    elif not MIN_ROLL_LENGTH <= raw_roll <= MAX_ROLL_LENGTH:
        errors.append(
            _error(None, "roll_length", "卷长必须在 1 至 1000000 毫米之间")
        )
    else:
        roll_length = raw_roll

    raw_zone = payload.get("zone_length")
    if raw_zone is not None:
        if not _is_int(raw_zone):
            errors.append(_error(None, "zone_length", "作业区长度必须为整数毫米"))
        elif raw_zone < 1:
            errors.append(
                _error(None, "zone_length", "作业区长度必须大于或等于 1 毫米")
            )
        elif roll_length is not None and raw_zone > roll_length:
            errors.append(
                _error(
                    None,
                    "zone_length",
                    f"作业区长度不能超过卷长 {roll_length} 毫米",
                )
            )
        else:
            zone_length = raw_zone

    raw_defects = payload.get("defects")
    if not isinstance(raw_defects, list) or len(raw_defects) == 0:
        errors.append(_error(None, "defects", "缺陷列表不能为空"))
    else:
        for row, item in enumerate(raw_defects):
            if not isinstance(item, dict):
                errors.append(
                    _error(row, None, "缺陷记录必须为包含 start 与 end 的对象")
                )
                continue
            start, end = item.get("start"), item.get("end")
            ok = True
            if not _is_int(start):
                errors.append(_error(row, "start", "起点必须为整数毫米"))
                ok = False
            if not _is_int(end):
                errors.append(_error(row, "end", "终点必须为整数毫米"))
                ok = False
            if not ok:
                continue
            if start < 0:
                errors.append(_error(row, "start", "起点必须大于或等于 0"))
                ok = False
            if roll_length is not None and end > roll_length:
                errors.append(
                    _error(row, "end", f"终点不能超过卷长 {roll_length} 毫米")
                )
                ok = False
            if start >= end:
                errors.append(
                    _error(row, "end", "必须满足 0 ≤ 起点 < 终点 ≤ 卷长")
                )
                ok = False
            if ok:
                defects.append((start, end))

    return roll_length, defects, zone_length, errors
