"""Unit tests: recover JSON from truncated / messy LLM replies."""
import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import patch

from sarvamai.core.api_error import ApiError

import orchestrator
from orchestrator import _extract_json, _llm_message_text, llm_json


def test_extracts_valid_object():
    assert _extract_json('{"coverage_gaps":[]}') == {"coverage_gaps": []}


def test_extracts_fenced_json():
    text = 'Here you go:\n```json\n{"coverage_gaps":[{"area":"Login"}]}\n```\n'
    assert _extract_json(text) == {"coverage_gaps": [{"area": "Login"}]}


def test_extracts_first_object_when_trailing_prose():
    text = '{"missing_edge_cases":["timeout"]} thanks!'
    assert _extract_json(text) == {"missing_edge_cases": ["timeout"]}


def test_repairs_truncated_evaluator_payload():
    # Decision Stream snippet from a real EVALUATE call: model hit the token
    # cap mid-string. Must recover the object instead of returning None (which
    # forces the deterministic fallback).
    text = (
        '{"coverage_gaps":[{"area":"Login error-path coverage","severity":"high",'
        '"detail":"Plan tests empty fields and invalid-us'
    )
    data = _extract_json(text)
    assert data is not None
    assert data["coverage_gaps"][0]["area"] == "Login error-path coverage"
    assert data["coverage_gaps"][0]["severity"] == "high"
    assert "invalid-us" in data["coverage_gaps"][0]["detail"]


def test_repairs_truncated_after_complete_item():
    text = '{"coverage_gaps":[{"area":"Forms","severity":"medium","detail":"ok"},{"area":"Auth"'
    data = _extract_json(text)
    assert data is not None
    assert len(data["coverage_gaps"]) >= 1
    assert data["coverage_gaps"][0]["area"] == "Forms"


def test_repairs_trailing_commas():
    text = '{"coverage_gaps":[{"area":"Login","severity":"high","detail":"x",}],}'
    assert _extract_json(text) == {
        "coverage_gaps": [{"area": "Login", "severity": "high", "detail": "x"}]
    }


def test_repairs_unescaped_newlines_in_strings():
    text = '{"risk_notes":["line1\nline2"]}'
    assert _extract_json(text) == {"risk_notes": ["line1\nline2"]}


def test_empty_or_non_json_returns_none():
    assert _extract_json("") is None
    assert _extract_json(None) is None
    assert _extract_json("no json here") is None


def test_llm_message_text_prefers_content():
    msg = SimpleNamespace(content='{"ok":true}', reasoning_content='{"from":"reasoning"}')
    assert _llm_message_text(msg) == '{"ok":true}'


def test_llm_message_text_falls_back_to_reasoning_when_content_empty():
    msg = SimpleNamespace(content=None, reasoning_content='{"coverage_gaps":[]}')
    assert _llm_message_text(msg) == '{"coverage_gaps":[]}'
    msg = SimpleNamespace(content="   ", reasoning_content='{"coverage_gaps":[]}')
    assert _llm_message_text(msg) == '{"coverage_gaps":[]}'


def test_llm_message_text_empty_when_both_missing():
    assert _llm_message_text(SimpleNamespace(content=None, reasoning_content=None)) == ""


def test_llm_json_recovers_truncated_evaluator_content():
    truncated = (
        '{"coverage_gaps":[{"area":"Login error-path coverage","severity":"high",'
        '"detail":"Plan tests empty fields and invalid-us'
    )
    resp = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
        content=truncated, reasoning_content=None))])

    class _Chat:
        async def completions(self, **kwargs):
            return resp

    class _Client:
        chat = _Chat()

    async def run():
        with patch.object(orchestrator, "SARVAM_API_KEY", "test-key"), \
             patch.object(orchestrator, "_get_sarvam_client", return_value=_Client()):
            return await llm_json("sys", "audit now", "sarvam-105b")

    data, text = asyncio.run(run())
    assert text == truncated
    assert data["coverage_gaps"][0]["area"] == "Login error-path coverage"


def test_llm_json_logs_sarvam_api_error(caplog):
    class _Chat:
        async def completions(self, **kwargs):
            raise ApiError(status_code=402, body={"error": {"message": "No credits available."}})

    class _Client:
        chat = _Chat()

    async def run():
        with patch.object(orchestrator, "SARVAM_API_KEY", "test-key"), \
             patch.object(orchestrator, "_get_sarvam_client", return_value=_Client()):
            return await llm_json("sys", "prompt", "sarvam-105b", session="run-1")

    with caplog.at_level(logging.ERROR, logger="orchestrator"):
        try:
            asyncio.run(run())
        except RuntimeError as e:
            assert "402" in str(e)
            assert "No credits available" in str(e)
        else:
            raise AssertionError("expected RuntimeError")

    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "Sarvam returned an error" in logged
    assert "402" in logged
    assert "No credits available" in logged
    assert "run-1" in logged
