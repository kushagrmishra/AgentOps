from __future__ import annotations

from app.services.tools import execute_tool, sanitize_tool_arguments


def test_sanitize_tool_arguments():
    raw_arguments = {
        "api_key": "sk-ant-live-secret-key-12345",
        "bearer_token": "ey1234567890abcdefghijklmnopqrstuvwxyz1234567890",
        "db_password": "super-secret-password",
        "nested": {
            "auth_header": "Bearer secret-credential",
            "safe_param": "hello world",
        },
        "query": "AAPL quarterly revenue 2026",
        "max_results": 5,
    }

    sanitized = sanitize_tool_arguments(raw_arguments)
    assert sanitized["api_key"] == "[REDACTED]"
    assert sanitized["bearer_token"] == "[REDACTED]"
    assert sanitized["db_password"] == "[REDACTED]"
    assert sanitized["nested"]["auth_header"] == "[REDACTED]"
    assert sanitized["nested"]["safe_param"] == "hello world"
    assert sanitized["query"] == "AAPL quarterly revenue 2026"
    assert sanitized["max_results"] == 5


def test_execute_tool_redacts_arguments_in_outcome():
    outcome = execute_tool(
        tool_name="web_search",
        arguments={"query": "test query", "secret_key": "sk-secret-12345"},
        allowed=["web_search"],
    )
    assert outcome.tool_name == "web_search"
    assert outcome.arguments["secret_key"] == "[REDACTED]"
    assert outcome.arguments["query"] == "test query"
