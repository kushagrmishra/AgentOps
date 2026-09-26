from __future__ import annotations

import io
from app.core.config import settings


def test_upload_and_list_files(auth_client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "workspace_root", str(tmp_path))

    # Upload a text file
    file_bytes = b"Product,Price,Features\nWidgetPro,99,Analytics\nWidgetLite,49,Basic"
    response = auth_client.post(
        "/api/files/upload",
        files={"file": ("competitors.csv", io.BytesIO(file_bytes), "text/csv")},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["filename"].startswith("competitors")
    assert "uploads" in data["path"]
    assert "CSV with headers: Product, Price, Features" in data["preview"]

    # List workspace files
    list_res = auth_client.get("/api/files")
    assert list_res.status_code == 200
    files = list_res.json()
    assert any("competitors" in f["name"] for f in files)

    # Download file
    dl_res = auth_client.get(f"/api/files/download?path={data['path']}")
    assert dl_res.status_code == 200
    assert dl_res.content == file_bytes

    # Upload and download markdown file
    md_bytes = b"# Executive Report\n\n- Key Metric: 99%\n"
    md_upload = auth_client.post(
        "/api/files/upload",
        files={"file": ("report.md", io.BytesIO(md_bytes), "text/markdown")},
    )
    assert md_upload.status_code == 201
    md_data = md_upload.json()
    assert md_data["filename"].endswith(".md")
    md_dl = auth_client.get(f"/api/files/download?path={md_data['path']}")
    assert md_dl.status_code == 200
    assert md_dl.content == md_bytes
