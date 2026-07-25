from __future__ import annotations

import ast
import logging
import operator
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.core.config import TOOL_CONTRACT, settings

logger = logging.getLogger(__name__)

TOOL_SPECS: dict[str, dict] = {tool["name"]: tool for tool in TOOL_CONTRACT}

_MAX_FILE_BYTES = 128_000


class ToolError(Exception):
    """Raised for a bad tool name, bad arguments, or a denied tool."""


@dataclass(slots=True)
class ToolOutcome:
    tool_name: str
    arguments: dict[str, Any]
    result: str
    status: str = "ok"
    error: str | None = None
    duration_ms: int = 0


# --------------------------------------------------------------------- web_search

def _ddg_text_search(query: str, limit: int) -> list[dict[str, str]]:
    """Live DuckDuckGo search (free, no API key)."""
    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise ToolError("ddgs package is not installed") from exc

    hits: list[dict[str, str]] = []
    try:
        with DDGS() as ddgs:
            for row in ddgs.text(query, max_results=limit):
                hits.append(
                    {
                        "title": str(row.get("title") or "").strip(),
                        "href": str(row.get("href") or row.get("link") or "").strip(),
                        "body": str(row.get("body") or row.get("snippet") or "").strip(),
                    }
                )
    except Exception as exc:
        logger.warning("duckduckgo_search failed (%s); trying instant-answer API", exc)
        hits = _ddg_instant_answer(query, limit)
    return hits


def _ddg_instant_answer(query: str, limit: int) -> list[dict[str, str]]:
    """Fallback: DuckDuckGo Instant Answer API (also free, no key)."""
    try:
        response = httpx.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
            headers={"User-Agent": "AgentOps/1.0 (+https://github.com/agentops)"},
            timeout=20.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        raise ToolError(f"web_search network error: {exc}") from exc

    hits: list[dict[str, str]] = []
    abstract = str(data.get("AbstractText") or "").strip()
    abstract_url = str(data.get("AbstractURL") or "").strip()
    heading = str(data.get("Heading") or query).strip()
    if abstract:
        hits.append({"title": heading, "href": abstract_url, "body": abstract})

    for topic in data.get("RelatedTopics") or []:
        if len(hits) >= limit:
            break
        if not isinstance(topic, dict):
            continue
        if "Topics" in topic:
            for nested in topic.get("Topics") or []:
                if len(hits) >= limit:
                    break
                if isinstance(nested, dict) and nested.get("Text"):
                    hits.append(
                        {
                            "title": str(nested.get("Text") or "")[:80],
                            "href": str(nested.get("FirstURL") or ""),
                            "body": str(nested.get("Text") or ""),
                        }
                    )
            continue
        if topic.get("Text"):
            hits.append(
                {
                    "title": str(topic.get("Text") or "")[:80],
                    "href": str(topic.get("FirstURL") or ""),
                    "body": str(topic.get("Text") or ""),
                }
            )
    return hits[:limit]


def web_search(arguments: dict[str, Any]) -> str:
    query = str(arguments.get("query") or "").strip()
    if not query:
        raise ToolError("web_search requires a non-empty 'query' argument")

    limit = int(arguments.get("limit") or 3)
    limit = max(1, min(limit, 5))

    hits = _ddg_text_search(query, limit)
    if not hits:
        return f'No live results for "{query}". Try a more specific query.'

    lines = [f'Live web results for "{query}" ({len(hits)}):', ""]
    for rank, hit in enumerate(hits, start=1):
        title = hit.get("title") or "Result"
        href = hit.get("href") or ""
        body = hit.get("body") or ""
        lines.append(f"{rank}. {title}")
        if href:
            lines.append(f"   {href}")
        if body:
            lines.append(f"   {body}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


# ----------------------------------------------------------------------- run_code

_SAFE_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_SAFE_CALLS: dict[str, Callable] = {
    "sum": sum, "len": len, "min": min, "max": max,
    "abs": abs, "round": round, "sorted": sorted, "float": float, "int": int,
}


def _safe_eval(node: ast.AST) -> Any:
    """Evaluate arithmetic only. Never exec model-authored code."""
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float, str)):
        return node.value
    if isinstance(node, (ast.List, ast.Tuple)):
        return [_safe_eval(element) for element in node.elts]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _safe_eval(node.operand)
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_BINOPS:
        return _SAFE_BINOPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _SAFE_CALLS:
        if node.keywords:
            raise ToolError("keyword arguments are not supported in the sandbox")
        return _SAFE_CALLS[node.func.id](*[_safe_eval(arg) for arg in node.args])
    raise ToolError("expression is outside the arithmetic sandbox")


def _try_arithmetic(code: str) -> str | None:
    """Return real output for simple `print(<arithmetic>)` snippets, else None."""
    outputs: list[str] = []
    try:
        tree = ast.parse(code.strip())
    except SyntaxError:
        return None

    bindings: dict[str, ast.AST] = {}

    class Resolver(ast.NodeTransformer):
        def visit_Name(self, node: ast.Name):  # noqa: N802 - visitor API
            if node.id in bindings:
                return self.visit(bindings[node.id])
            return node

    for statement in tree.body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target = statement.targets[0]
            if isinstance(target, ast.Name):
                bindings[target.id] = statement.value
                continue
            return None
        if (
            isinstance(statement, ast.Expr)
            and isinstance(statement.value, ast.Call)
            and isinstance(statement.value.func, ast.Name)
            and statement.value.func.id == "print"
        ):
            try:
                parts = [
                    _safe_eval(ast.Expression(Resolver().visit(arg)))
                    for arg in statement.value.args
                ]
            except (ToolError, TypeError, ZeroDivisionError, ValueError):
                return None
            outputs.append(" ".join(str(part) for part in parts))
            continue
        return None

    return "\n".join(outputs) if outputs else None


def run_code(arguments: dict[str, Any]) -> str:
    code = str(arguments.get("code") or "").strip()
    if not code:
        raise ToolError("run_code requires a non-empty 'code' argument")
    language = str(arguments.get("language") or "python").lower()
    if language not in {"python", "py"}:
        raise ToolError(f"run_code only supports python, got '{language}'")

    # Prefer E2B sandboxed execution (never exec on the main server).
    if settings.e2b_api_key:
        try:
            from e2b_code_interpreter import Sandbox

            with Sandbox.create(api_key=settings.e2b_api_key) as sandbox:
                execution = sandbox.run_code(code)
            stdout = ""
            if getattr(execution, "logs", None) and getattr(execution.logs, "stdout", None):
                stdout = "".join(execution.logs.stdout)
            elif getattr(execution, "text", None):
                stdout = str(execution.text)
            err = ""
            if getattr(execution, "error", None):
                err = str(execution.error)
            header = f"$ e2b python <{len(code)} bytes>\n"
            body = stdout or "(no stdout)"
            if err:
                return f"{header}{body}\n\nERROR: {err}\nexit code: 1"
            return f"{header}{body}\n\nexit code: 0 (executed in E2B sandbox)"
        except Exception as exc:
            logger.exception("E2B execution failed")
            raise ToolError(f"E2B sandbox error: {exc}") from exc

    # Dev/test fallback: arithmetic-only sandbox (no arbitrary exec).
    real_output = _try_arithmetic(code)
    header = f"$ python -c <{len(code)} bytes>\n"
    if real_output is not None:
        return f"{header}{real_output}\n\nexit code: 0 (arithmetic evaluated in-process, no exec)"

    raise ToolError(
        "E2B_API_KEY not configured and code is outside the arithmetic sandbox. "
        "Set E2B_API_KEY for full sandboxed execution."
    )


# ---------------------------------------------------------------------- read_file

def _resolve_workspace_file(path: str) -> Path:
    if not path or path.startswith("/") or path.startswith("~") or ".." in Path(path).parts:
        raise ToolError("read_file only accepts workspace-relative paths")

    root = settings.workspace_path
    candidate = (root / path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ToolError("read_file only accepts workspace-relative paths") from exc
    return candidate


def read_file(arguments: dict[str, Any]) -> str:
    path = str(arguments.get("path") or "").strip()
    if not path:
        raise ToolError("read_file requires a non-empty 'path' argument")

    target = _resolve_workspace_file(path)
    if not target.exists():
        raise ToolError(f"file not found: {path}")
    if not target.is_file():
        raise ToolError(f"not a file: {path}")

    size = target.stat().st_size
    if size > _MAX_FILE_BYTES:
        raise ToolError(f"file too large ({size} bytes); limit is {_MAX_FILE_BYTES}")

    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ToolError("file is not valid UTF-8 text") from exc

    return f"--- {path} ---\n{content}"


REGISTRY: dict[str, Callable[[dict[str, Any]], str]] = {
    "web_search": web_search,
    "run_code": run_code,
    "read_file": read_file,
}


def tool_prompt_block(allowed: list[str]) -> str:
    """Render the tool contract the sub-agent sees in its system prompt."""
    if not allowed:
        return "You have no tools available. Answer from reasoning alone."
    lines = []
    for name in allowed:
        spec = TOOL_SPECS.get(name)
        if not spec:
            continue
        args = {
            "web_search": '{"query": "<search terms>", "limit": 3}',
            "run_code": '{"language": "python", "code": "<source>"}',
            "read_file": '{"path": "<workspace-relative path>"}',
        }.get(name, "{}")
        lines.append(f"- {name}: {spec['description']}\n  arguments: {args}")
    return "\n".join(lines)


def execute_tool(tool_name: str, arguments: dict[str, Any], allowed: list[str]) -> ToolOutcome:
    """Run a tool under the calling agent's allowlist, never raising."""
    started = time.perf_counter()

    def finish(result: str, status: str = "ok", error: str | None = None) -> ToolOutcome:
        return ToolOutcome(
            tool_name=tool_name,
            arguments=arguments if isinstance(arguments, dict) else {"_raw": str(arguments)},
            result=result,
            status=status,
            error=error,
            duration_ms=int((time.perf_counter() - started) * 1000),
        )

    if tool_name not in REGISTRY:
        message = f"unknown tool '{tool_name}'. Available: {', '.join(REGISTRY)}"
        return finish(f"ERROR: {message}", status="error", error=message)

    if tool_name not in allowed:
        message = (
            f"tool '{tool_name}' is not in this agent's allowlist ({', '.join(allowed) or 'empty'})"
        )
        return finish(f"ERROR: {message}", status="denied", error=message)

    if not isinstance(arguments, dict):
        message = f"arguments for '{tool_name}' must be an object"
        return finish(f"ERROR: {message}", status="error", error=message)

    try:
        return finish(REGISTRY[tool_name](arguments))
    except ToolError as exc:
        return finish(f"ERROR: {exc}", status="error", error=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        message = f"{type(exc).__name__}: {exc}"
        return finish(f"ERROR: {message}", status="error", error=message)
