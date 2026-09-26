from __future__ import annotations

import csv
import io
import json
import logging
import re
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import AuthCtx, DbSession
from app.models import Run, Step, ToolCall
from app.services.document_generator import (
    generate_animated_html_deck,
    generate_docx,
    generate_pdf,
    generate_pptx,
)
from app.services.tools import _resolve_workspace_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


class FileInfo(BaseModel):
    name: str
    path: str
    size_bytes: int
    is_dir: bool = False
    preview: str | None = None


class FileUploadResponse(BaseModel):
    filename: str
    path: str
    size_bytes: int
    preview: str
    message: str


class ExportRequest(BaseModel):
    path: str | None = None
    markdown: str | None = None
    title: str | None = None
    format: str = "pdf"  # "pptx", "docx", "pdf", "html"


class ExportResponse(BaseModel):
    filename: str
    path: str
    format: str
    size_bytes: int
    download_url: str


def _sanitize_filename(name: str) -> str:
    cleaned = Path(name).name
    # Keep only letters, digits, dots, dashes, underscores
    cleaned = re.sub(r"[^\w\.\-]", "_", cleaned)
    return cleaned or "uploaded_file.txt"


def _extract_preview(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            import pypdf

            reader = pypdf.PdfReader(str(path))
            pages = []
            for i, page in enumerate(reader.pages[:3]):
                txt = (page.extract_text() or "").strip()
                if txt:
                    pages.append(f"[Page {i+1}]\n{txt[:400]}")
            total = len(reader.pages)
            joined = "\n\n".join(pages)
            return f"PDF with {total} pages:\n{joined}" if joined else f"PDF with {total} pages (no extractable text)"
        except Exception as exc:
            return f"PDF uploaded (preview unavailable: {exc})"

    if suffix in {".csv", ".tsv"}:
        delimiter = "\t" if suffix == ".tsv" else ","
        try:
            with path.open("r", encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f, delimiter=delimiter)
                rows = [row for i, row in enumerate(reader) if i < 5]
                headers = rows[0] if rows else []
                return f"CSV with headers: {', '.join(headers[:10])}\nFirst rows: {rows[1:4]}"
        except Exception as exc:
            return f"CSV uploaded ({exc})"

    if suffix in {".xlsx", ".xlsm"}:
        try:
            import openpyxl

            wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
            samples = []
            for sheet_name in wb.sheetnames[:2]:
                sheet = wb[sheet_name]
                sheet_rows = []
                for idx, row in enumerate(sheet.iter_rows(values_only=True)):
                    if idx >= 4:
                        break
                    vals = ["" if v is None else str(v).strip() for v in row]
                    if any(vals):
                        sheet_rows.append(" | ".join(vals[:8]))
                if sheet_rows:
                    samples.append(f"Sheet '{sheet_name}':\n" + "\n".join(sheet_rows))
            wb.close()
            return "\n\n".join(samples) or "Excel workbook uploaded"
        except Exception as exc:
            return f"Excel workbook uploaded ({exc})"

    if suffix == ".json":
        try:
            with path.open("r", encoding="utf-8", errors="replace") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return f"JSON Array with {len(data)} items. Sample: {json.dumps(data[:2], default=str)[:300]}"
                if isinstance(data, dict):
                    return f"JSON Object with keys: {list(data.keys())[:15]}"
                return f"JSON: {json.dumps(data)[:300]}"
        except Exception:
            pass

    # Default text preview
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
        return content[:800] + ("..." if len(content) > 800 else "")
    except Exception:
        return f"{suffix} file uploaded ({path.stat().st_size} bytes)"


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    ctx: AuthCtx,
    file: Annotated[UploadFile, File(...)],
) -> FileUploadResponse:
    safe_name = _sanitize_filename(file.filename or "upload.txt")
    upload_dir = settings.workspace_path / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    target_path = upload_dir / safe_name
    if target_path.exists():
        stem = target_path.stem
        suffix = target_path.suffix
        counter = 1
        while target_path.exists():
            target_path = upload_dir / f"{stem}_{counter}{suffix}"
            counter += 1

    content = await file.read()
    max_upload = getattr(settings, "max_upload_bytes", MAX_UPLOAD_BYTES)
    if len(content) > max_upload:
        limit_mb = max_upload // (1024 * 1024)
        limit_str = f"{limit_mb}MB" if limit_mb > 0 else f"{max_upload} bytes"
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {limit_str}",
        )

    target_path.write_bytes(content)
    rel_path = str(target_path.relative_to(settings.workspace_path))
    preview = _extract_preview(target_path)

    return FileUploadResponse(
        filename=target_path.name,
        path=rel_path,
        size_bytes=len(content),
        preview=preview,
        message=f"File '{target_path.name}' uploaded to workspace '{rel_path}'. Agents can read it using read_file.",
    )


@router.get("", response_model=list[FileInfo])
def list_workspace_files(ctx: AuthCtx) -> list[FileInfo]:
    root = settings.workspace_path
    if not root.exists():
        return []

    results: list[FileInfo] = []
    for item in sorted(root.rglob("*")):
        if item.name.startswith("."):
            continue
        rel = str(item.relative_to(root))
        if item.is_dir():
            continue
        results.append(
            FileInfo(
                name=item.name,
                path=rel,
                size_bytes=item.stat().st_size,
                is_dir=False,
            )
        )
    return results


@router.get("/download")
def download_workspace_file(
    ctx: AuthCtx,
    path: Annotated[str, Query(description="Workspace-relative path to download")],
) -> FileResponse:
    try:
        target = _resolve_workspace_file(path)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type="application/octet-stream",
    )


def resolve_run_document_content(run: Run, db: DbSession) -> tuple[str, str]:
    """
    Resolve the actual comprehensive research/document produced by a run.
    Checks:
    1. Workspace files created via write_file tool calls in this run.
    2. Markdown files referenced in run.final_output.
    3. Content of run.final_output itself if substantive.
    4. Aggregated outputs of completed steps.
    5. Fallback to run.final_output or run.goal.
    Returns (content, title).
    """
    written_files: list[Path] = []

    # 1. Inspect tool calls for write_file
    try:
        stmt = (
            select(ToolCall)
            .join(Step, ToolCall.step_id == Step.id)
            .where(Step.run_id == run.id, ToolCall.tool_name == "write_file")
            .order_by(ToolCall.created_at.desc())
        )
        tool_calls = db.scalars(stmt).all()
        for tc in tool_calls:
            args = tc.arguments
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            if isinstance(args, dict):
                path_val = args.get("path") or args.get("filename")
                if path_val:
                    try:
                        resolved = _resolve_workspace_file(str(path_val))
                        if resolved.exists() and resolved.is_file() and resolved.suffix.lower() in {".md", ".markdown", ".txt"}:
                            if resolved not in written_files:
                                written_files.append(resolved)
                    except Exception:
                        pass
    except Exception as exc:
        logger.warning("Error inspecting tool calls for run %s: %s", run.id, exc)

    # 2. Inspect run.final_output for referenced markdown files
    if run.final_output:
        md_refs = re.findall(r"['\"`]([\w\-\.\/]+\.md)['\"`]|(?:\b([\w\-\.\/]+\.md)\b)", run.final_output)
        for ref_tuple in md_refs:
            filename = ref_tuple[0] or ref_tuple[1]
            if filename:
                try:
                    resolved = _resolve_workspace_file(filename)
                    if resolved.exists() and resolved.is_file() and resolved not in written_files:
                        written_files.append(resolved)
                except Exception:
                    pass

    # Pick the most comprehensive written file if available
    best_file_content: str | None = None
    if written_files:
        written_files.sort(key=lambda p: p.stat().st_size, reverse=True)
        for wf in written_files:
            try:
                txt = wf.read_text(encoding="utf-8", errors="replace").strip()
                if len(txt) > 50:
                    best_file_content = txt
                    break
            except Exception:
                continue

    content = ""
    if best_file_content:
        # If run.final_output is short (< 600 chars) or doesn't start with a heading, prefer the full file!
        if not run.final_output or len(run.final_output.strip()) < len(best_file_content) or not run.final_output.strip().startswith("#"):
            content = best_file_content
        else:
            content = run.final_output
    elif run.final_output and len(run.final_output.strip()) > 30:
        content = run.final_output
    else:
        # Step outputs aggregation
        step_texts = []
        if run.steps:
            for step in run.steps:
                if step.output and step.output.strip():
                    step_texts.append(f"## {step.title}\n\n{step.output.strip()}")
        if step_texts:
            content = "\n\n".join(step_texts)
        else:
            content = run.final_output or run.goal or "No content generated."

    # Extract clean title from markdown # heading or run.goal
    title = ""
    for line in content.splitlines():
        s = line.strip()
        if s.startswith("# "):
            title = s[2:].strip()
            break
    if not title:
        title = (run.goal or "Research Report")[:80].strip()

    return content, title


@router.post("/export", response_model=ExportResponse)
def export_document(
    ctx: AuthCtx,
    req: ExportRequest,
) -> ExportResponse:
    content: str = ""
    default_title = "Executive Report"

    if req.path:
        try:
            target = _resolve_workspace_file(req.path)
            if not target.exists():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File not found: {req.path}")
            content = target.read_text(encoding="utf-8", errors="replace")
            default_title = target.stem.replace("_", " ").title()
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    elif req.markdown:
        content = req.markdown
        # If markdown is short (< 500 chars) and references a .md file in workspace, load that file
        if len(content.strip()) < 500:
            md_refs = re.findall(r"['\"`]([\w\-\.\/]+\.md)['\"`]|(?:\b([\w\-\.\/]+\.md)\b)", content)
            for ref_tuple in md_refs:
                filename = ref_tuple[0] or ref_tuple[1]
                if filename:
                    try:
                        resolved = _resolve_workspace_file(filename)
                        if resolved.exists() and resolved.is_file() and resolved.stat().st_size > len(content):
                            content = resolved.read_text(encoding="utf-8", errors="replace")
                            default_title = resolved.stem.replace("_", " ").title()
                            break
                    except Exception:
                        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'path' or 'markdown' must be provided in the request body",
        )

    title = req.title or default_title
    fmt = req.format.lower().strip()
    export_dir = settings.workspace_path / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)

    safe_title = re.sub(r"[^\w\-]", "_", title.lower()).strip("_") or "report"

    if fmt == "pptx":
        out_filename = f"{safe_title}.pptx"
        out_path = export_dir / out_filename
        generate_pptx(content, title=title, output_path=out_path)
    elif fmt == "docx":
        out_filename = f"{safe_title}.docx"
        out_path = export_dir / out_filename
        generate_docx(content, title=title, output_path=out_path)
    elif fmt == "pdf":
        out_filename = f"{safe_title}.pdf"
        out_path = export_dir / out_filename
        generate_pdf(content, title=title, output_path=out_path)
    elif fmt in {"html", "presentation"}:
        out_filename = f"{safe_title}_presentation.html"
        out_path = export_dir / out_filename
        html_code = generate_animated_html_deck(content, title=title)
        out_path.write_text(html_code, encoding="utf-8")
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{req.format}'. Supported: pptx, docx, pdf, html",
        )

    rel_path = str(out_path.relative_to(settings.workspace_path))
    return ExportResponse(
        filename=out_filename,
        path=rel_path,
        format=fmt,
        size_bytes=out_path.stat().st_size,
        download_url=f"/api/files/download?path={rel_path}",
    )


@router.get("/export-run/{run_id}")
def export_run_document(
    ctx: AuthCtx,
    db: DbSession,
    run_id: str,
    format: Annotated[str, Query(description="Export format: pptx, docx, pdf, html")] = "pdf",
) -> FileResponse:
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    content, resolved_title = resolve_run_document_content(run, db)
    title = resolved_title or (run.goal[:80].strip())
    fmt = format.lower().strip()

    export_dir = settings.workspace_path / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    safe_title = re.sub(r"[^\w\-]", "_", title.lower()).strip("_")[:40] or f"run_{run.id[:8]}"

    media_types = {
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
        "html": "text/html",
    }

    if fmt == "pptx":
        out_path = export_dir / f"{safe_title}.pptx"
        generate_pptx(content, title=title, output_path=out_path)
    elif fmt == "docx":
        out_path = export_dir / f"{safe_title}.docx"
        generate_docx(content, title=title, output_path=out_path)
    elif fmt == "pdf":
        out_path = export_dir / f"{safe_title}.pdf"
        generate_pdf(content, title=title, output_path=out_path)
    elif fmt in {"html", "presentation"}:
        out_path = export_dir / f"{safe_title}_presentation.html"
        html_code = generate_animated_html_deck(content, title=title)
        out_path.write_text(html_code, encoding="utf-8")
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported format: {fmt}")

    return FileResponse(
        path=str(out_path),
        filename=out_path.name,
        media_type=media_types.get(fmt, "application/octet-stream"),
    )

