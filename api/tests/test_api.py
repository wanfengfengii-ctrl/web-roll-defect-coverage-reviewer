"""API 契约测试：合法输入、非法输入整次失败、行号定位、顺序无关。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_merge_ok():
    resp = client.post(
        "/api/merge",
        json={
            "roll_length": 1000,
            "defects": [
                {"start": 10, "end": 20},
                {"start": 15, "end": 30},
                {"start": 500, "end": 600},
            ],
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {
        "roll_length": 1000,
        "merged": [{"start": 10, "end": 30}, {"start": 500, "end": 600}],
        "covered_mm": 120,
        "coverage_ratio": 0.12,
    }


def test_closed_interval_touching_merges():
    resp = client.post(
        "/api/merge",
        json={
            "roll_length": 100,
            "defects": [{"start": 0, "end": 10}, {"start": 10, "end": 20}],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["merged"] == [{"start": 0, "end": 20}]
    assert body["covered_mm"] == 20
    assert body["coverage_ratio"] == 0.2


def test_input_order_does_not_change_response():
    defects_a = [
        {"start": 500, "end": 600},
        {"start": 10, "end": 20},
        {"start": 15, "end": 30},
    ]
    defects_b = list(reversed(defects_a))
    resp_a = client.post(
        "/api/merge", json={"roll_length": 1000, "defects": defects_a}
    ).json()
    resp_b = client.post(
        "/api/merge", json={"roll_length": 1000, "defects": defects_b}
    ).json()
    assert resp_a == resp_b


def test_full_roll_coverage_ratio_is_one():
    resp = client.post(
        "/api/merge",
        json={"roll_length": 1_000_000, "defects": [{"start": 0, "end": 1_000_000}]},
    )
    assert resp.status_code == 200
    assert resp.json()["coverage_ratio"] == 1.0


def _errors(resp) -> list[dict]:
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["message"]
    return detail["errors"]


def test_empty_defect_list_fails():
    resp = client.post("/api/merge", json={"roll_length": 1000, "defects": []})
    errors = _errors(resp)
    assert any(e["field"] == "defects" for e in errors)


def test_missing_defects_fails():
    resp = client.post("/api/merge", json={"roll_length": 1000})
    _errors(resp)


def test_non_object_body_fails():
    resp = client.post("/api/merge", json=[1, 2, 3])
    _errors(resp)


@pytest.mark.parametrize("bad", [1.5, 10.0, "10", "", True, None, [1], {"x": 1}])
def test_non_integer_start_fails_with_row(bad):
    resp = client.post(
        "/api/merge",
        json={"roll_length": 1000, "defects": [{"start": bad, "end": 20}]},
    )
    errors = _errors(resp)
    assert errors[0]["row"] == 0
    assert errors[0]["field"] == "start"


@pytest.mark.parametrize("bad", [1.5, "20", False, None])
def test_non_integer_end_fails_with_row(bad):
    resp = client.post(
        "/api/merge",
        json={"roll_length": 1000, "defects": [{"start": 10, "end": bad}]},
    )
    errors = _errors(resp)
    assert errors[0]["row"] == 0
    assert errors[0]["field"] == "end"


@pytest.mark.parametrize("bad_roll", [0, -5, 1_000_001, 1.5, "1000", True, None])
def test_invalid_roll_length_fails(bad_roll):
    resp = client.post(
        "/api/merge",
        json={"roll_length": bad_roll, "defects": [{"start": 1, "end": 2}]},
    )
    errors = _errors(resp)
    assert any(e["field"] == "roll_length" for e in errors)


def test_boundary_roll_lengths_accepted():
    for roll in (1, 1_000_000):
        resp = client.post(
            "/api/merge",
            json={"roll_length": roll, "defects": [{"start": 0, "end": roll}]},
        )
        assert resp.status_code == 200


@pytest.mark.parametrize(
    "defect",
    [
        {"start": -1, "end": 5},      # 起点越界
        {"start": 0, "end": 1001},    # 终点越界
        {"start": 5, "end": 5},       # 起点 == 终点
        {"start": 8, "end": 3},       # 起点 > 终点
    ],
)
def test_out_of_bounds_defect_fails(defect):
    resp = client.post(
        "/api/merge", json={"roll_length": 1000, "defects": [defect]}
    )
    errors = _errors(resp)
    assert errors[0]["row"] == 0


def test_error_locates_exact_row():
    resp = client.post(
        "/api/merge",
        json={
            "roll_length": 1000,
            "defects": [
                {"start": 1, "end": 2},
                {"start": 10, "end": 20},
                {"start": 900, "end": 1200},
            ],
        },
    )
    errors = _errors(resp)
    assert [e["row"] for e in errors] == [2]


def test_multiple_errors_all_reported():
    resp = client.post(
        "/api/merge",
        json={
            "roll_length": 1000,
            "defects": [
                {"start": "a", "end": 2},
                {"start": 1, "end": 2},
                {"start": 3, "end": 9999},
            ],
        },
    )
    errors = _errors(resp)
    assert {e["row"] for e in errors} == {0, 2}


def test_invalid_submission_returns_no_result_body():
    resp = client.post(
        "/api/merge",
        json={"roll_length": 1000, "defects": [{"start": 5, "end": 5}]},
    )
    assert resp.status_code == 422
    assert "merged" not in resp.json()
