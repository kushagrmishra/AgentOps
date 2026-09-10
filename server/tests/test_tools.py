"""Tool sandbox: allowlist enforcement, argument validation, and the guarantee
that `execute_tool` never raises into the orchestrator."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.services import tools as tools_module
from app.services.tools import REGISTRY, ToolError, execute_tool, run_code, tool_prompt_block, web_search

ALL_TOOLS = list(REGISTRY)


@pytest.fixture(autouse=True)
def _fake_live_search(monkeypatch):
    """Unit tests must not hit the public internet."""

    def fake(query: str, limit: int):
        return [
            {
                "title": f"Result about {query}",
                "href": f"https://example.com/{query.replace(' ', '-')}",
                "body": f"Live snippet discussing {query}.",
            }
            for _ in range(limit)
        ]

    monkeypatch.setattr(tools_module, "_ddg_text_search", fake)


def test_a_tool_outside_the_allowlist_is_denied():
    outcome = execute_tool("web_search", {"query": "anything"}, allowed=["run_code"])
    assert outcome.status == "denied"
    assert "allowlist" in outcome.error
    assert outcome.result.startswith("ERROR:")


def test_an_agent_with_no_tools_is_denied_everything():
    for name in ALL_TOOLS:
        assert execute_tool(name, {}, allowed=[]).status == "denied"


def test_an_unknown_tool_is_an_error_not_a_crash():
    outcome = execute_tool("drop_database", {}, allowed=["drop_database"])
    assert outcome.status == "error"
    assert "unknown tool" in outcome.error


def test_bad_arguments_surface_as_errors():
    outcome = execute_tool("web_search", {}, allowed=["web_search"])
    assert outcome.status == "error"
    assert "query" in outcome.error


def test_non_object_arguments_are_rejected():
    outcome = execute_tool("web_search", "just a string", allowed=["web_search"])  # type: ignore[arg-type]
    assert outcome.status == "error"
    assert outcome.arguments == {"_raw": "just a string"}


def test_a_successful_call_records_timing_and_output():
    outcome = execute_tool("web_search", {"query": "vector databases"}, allowed=["web_search"])
    assert outcome.status == "ok"
    assert outcome.error is None
    assert "vector databases" in outcome.result
    assert "Live web results" in outcome.result
    assert outcome.duration_ms >= 0


def test_web_search_result_count_is_clamped():
    assert web_search({"query": "q", "limit": 99}).count("https://example.com/") == 5
    assert web_search({"query": "q", "limit": -5}).count("https://example.com/") == 1
    assert web_search({"query": "q", "limit": 0}).count("https://example.com/") == 3


def test_run_code_really_evaluates_arithmetic():
    output = run_code({"code": "print(2 + 3 * 4)"})
    assert "14" in output
    assert "no exec" in output


def test_run_code_resolves_simple_variables():
    output = run_code({"code": "values = [1, 2, 3, 5, 8]\nprint(sum(values) / len(values))"})
    assert "3.8" in output


def test_run_code_rejects_unsafe_code():
    with pytest.raises(ToolError, match="E2B_API_KEY|rejected|arithmetic"):
        run_code({"code": "import os\nos.system('rm -rf /')"})


def test_run_code_rejects_other_languages():
    with pytest.raises(ToolError):
        run_code({"code": "console.log(1)", "language": "javascript"})


def test_read_file_refuses_to_escape_the_workspace():
    for path in ("/etc/passwd", "../../secrets.env"):
        outcome = execute_tool("read_file", {"path": path}, allowed=["read_file"])
        assert outcome.status == "error"
        assert "workspace-relative" in outcome.error


def test_read_file_returns_real_workspace_contents(tmp_path, monkeypatch):
    monkeypatch.setattr(type(settings), "workspace_path", property(lambda self: tmp_path))
    # settings.workspace_path is a property on the Settings class via instance —
    # patch the module-level settings object's path by writing into tmp and pointing env.
    target = tmp_path / "notes.txt"
    target.write_text("hello from workspace\n", encoding="utf-8")
    monkeypatch.setattr(settings, "workspace_root", str(tmp_path))
    # Clear cached path behaviour: workspace_path recomputes from workspace_root
    # Re-bind property access by monkeypatching tools.settings
    monkeypatch.setattr(tools_module.settings, "workspace_root", str(tmp_path))

    # Directly patch _resolve to use tmp_path
    def resolve(path: str) -> Path:
        if ".." in Path(path).parts or path.startswith("/"):
            raise ToolError("read_file only accepts workspace-relative paths")
        return tmp_path / path

    monkeypatch.setattr(tools_module, "_resolve_workspace_file", resolve)
    outcome = execute_tool("read_file", {"path": "notes.txt"}, allowed=["read_file"])
    assert outcome.status == "ok"
    assert "hello from workspace" in outcome.result


def test_prompt_block_only_advertises_granted_tools():
    block = tool_prompt_block(["web_search"])
    assert "web_search" in block
    assert "run_code" not in block


def test_prompt_block_is_explicit_when_no_tools_are_granted():
    assert "no tools" in tool_prompt_block([])


def test_write_file_and_list_files(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "workspace_root", str(tmp_path))
    monkeypatch.setattr(tools_module.settings, "workspace_root", str(tmp_path))

    def resolve(path: str) -> Path:
        if ".." in Path(path).parts or path.startswith("/"):
            raise ToolError("only accepts workspace-relative paths")
        return tmp_path / path

    monkeypatch.setattr(tools_module, "_resolve_workspace_file", resolve)

    # Write a file
    outcome = execute_tool(
        "write_file",
        {"path": "reports/summary.md", "content": "# Market Report\nCompetitor A: $20"},
        allowed=["write_file"],
    )
    assert outcome.status == "ok"
    assert "Successfully wrote" in outcome.result
    assert (tmp_path / "reports/summary.md").read_text() == "# Market Report\nCompetitor A: $20"

    # List files
    list_outcome = execute_tool("list_files", {"path": "reports"}, allowed=["list_files"])
    assert list_outcome.status == "ok"
    assert "summary.md" in list_outcome.result

