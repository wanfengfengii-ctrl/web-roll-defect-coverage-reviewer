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
) -> tuple[
    int | None,
    list[tuple[int, int]],
    int | None,
    int | None,
    int | None,
    list[Error],
]:
    """校验整个提交。

    返回 (roll_length, defects, zone_length, max_travel, sound_tolerance,
    errors)。errors 非空即整次失败，此时不得计算或返回任何归并结果。
    zone_length 为可选作业区长度：未提供时返回 None，请求与响应保持原结构。
    max_travel 与 sound_tolerance 是成对可选项：必须同时缺省或同时为整数，
    最大行程范围 1 ≤ 值 ≤ 卷长，容限范围 0 ≤ 值 ≤ 卷长。
    """
    errors: list[Error] = []
    roll_length: int | None = None
    zone_length: int | None = None
    max_travel: int | None = None
    sound_tolerance: int | None = None
    defects: list[tuple[int, int]] = []

    if not isinstance(payload, dict):
        return None, [], None, None, None, [
            _error(None, None, "请求体必须为 JSON 对象")
        ]

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

    max_travel, sound_tolerance = _validate_travel_pair(
        payload, roll_length, errors
    )

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

    return roll_length, defects, zone_length, max_travel, sound_tolerance, errors


def _validate_travel_pair(
    payload: dict[str, Any], roll_length: int | None, errors: list[Error]
) -> tuple[int | None, int | None]:
    """校验成对可选的最大行程与完好材料容限。

    二者必须同时缺省（键缺失或为 null）或同时提供为整数；
    最大行程范围 1 ≤ 值 ≤ 卷长，容限范围 0 ≤ 值 ≤ 卷长。
    任一项非法都不产出排程参数（返回 None, None），并向 errors 追加
    指向对应表单字段的错误；缺陷行错误与字段错误的相对顺序由
    「表单字段先于缺陷行」的校验顺序稳定保证。
    """
    present: dict[str, Any] = {}
    for field in ("max_travel", "sound_tolerance"):
        if field in payload and payload[field] is not None:
            present[field] = payload[field]

    if not present:
        return None, None

    # 只填了一个字段：成对性失败，两个字段都给出明确提示
    if len(present) == 1:
        missing = (
            "sound_tolerance" if "max_travel" in present else "max_travel"
        )
        missing_label = "完好材料容限" if missing == "sound_tolerance" else "最大行程"
        message = f"最大行程与完好材料容限必须同时填写；缺少{missing_label}"
        for field in ("max_travel", "sound_tolerance"):
            errors.append(_error(None, field, message))
        return None, None

    raw_travel = present["max_travel"]
    raw_tolerance = present["sound_tolerance"]
    travel: int | None = None
    tolerance: int | None = None

    if not _is_int(raw_travel):
        errors.append(_error(None, "max_travel", "最大行程必须为整数毫米"))
    elif raw_travel < 1:
        errors.append(_error(None, "max_travel", "最大行程必须大于或等于 1 毫米"))
    elif roll_length is not None and raw_travel > roll_length:
        errors.append(
            _error(
                None,
                "max_travel",
                f"最大行程不能超过卷长 {roll_length} 毫米",
            )
        )
    else:
        travel = raw_travel

    if not _is_int(raw_tolerance):
        errors.append(
            _error(None, "sound_tolerance", "完好材料容限必须为整数毫米")
        )
    elif raw_tolerance < 0:
        errors.append(
            _error(None, "sound_tolerance", "完好材料容限必须大于或等于 0 毫米")
        )
    elif roll_length is not None and raw_tolerance > roll_length:
        errors.append(
            _error(
                None,
                "sound_tolerance",
                f"完好材料容限不能超过卷长 {roll_length} 毫米",
            )
        )
    else:
        tolerance = raw_tolerance

    if errors and any(
        e["field"] in ("max_travel", "sound_tolerance") for e in errors
    ):
        return None, None
    return travel, tolerance
