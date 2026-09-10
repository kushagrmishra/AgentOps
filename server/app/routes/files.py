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

from app.core.config import settings
from app.core.deps import AuthCtx
from app.services.tools import _resolve_workspace_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


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
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
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
