from __future__ import annotations

from app.core.config import settings

SAMPLE_MD = """# Test Executive Summary
**Entity**: TestCorp
**Reporting Period**: Q3 2025

## 1. Executive Summary
- **ARR**: $100M
- **Gross Margin**: 75%

## 2. Key Risks
1. **RF-01: Concentration Risk**: High customer concentration.
"""

def test_export_document_endpoints(auth_client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "workspace_root", str(tmp_path))

    # Test exporting to HTML
    res_html = auth_client.post(
        "/api/files/export",
        json={"markdown": SAMPLE_MD, "title": "Test Presentation", "format": "html"},
    )
    assert res_html.status_code == 200
    data_html = res_html.json()
    assert data_html["format"] == "html"
    assert "download_url" in data_html
    assert data_html["size_bytes"] > 0

    # Test exporting to PPTX
    res_pptx = auth_client.post(
        "/api/files/export",
        json={"markdown": SAMPLE_MD, "title": "Test PPTX", "format": "pptx"},
    )
    assert res_pptx.status_code == 200
    data_pptx = res_pptx.json()
    assert data_pptx["format"] == "pptx"
    assert data_pptx["filename"].endswith(".pptx")
    assert data_pptx["size_bytes"] > 0

    # Test exporting to DOCX
    res_docx = auth_client.post(
        "/api/files/export",
        json={"markdown": SAMPLE_MD, "title": "Test Word", "format": "docx"},
    )
    assert res_docx.status_code == 200
    data_docx = res_docx.json()
    assert data_docx["format"] == "docx"
    assert data_docx["filename"].endswith(".docx")
    assert data_docx["size_bytes"] > 0

    # Test exporting to PDF
    res_pdf = auth_client.post(
        "/api/files/export",
        json={"markdown": SAMPLE_MD, "title": "Test PDF", "format": "pdf"},
    )
    assert res_pdf.status_code == 200
    data_pdf = res_pdf.json()
    assert data_pdf["format"] == "pdf"
    assert data_pdf["filename"].endswith(".pdf")
    assert data_pdf["size_bytes"] > 0


def test_export_run_with_research_file(auth_client, db, tmp_path, monkeypatch):
    import json
    import pypdf
    from app.models import Run, Step, ToolCall

    monkeypatch.setattr(settings, "workspace_root", str(tmp_path))

    # Create workspace research file
    research_filename = "laptop_evaluation_report.md"
    research_content = """# Best Engineering Laptops 2026

## Top Recommendations
1. **Lenovo ThinkPad P16**: Ultimate workstation for CAD and simulation.
2. **MacBook Pro M3 Max**: Unmatched battery life and UNIX environment.

## Specs Comparison
| Model | CPU | RAM | Storage |
| --- | --- | --- | --- |
| ThinkPad P16 | Core i9 | 64GB | 2TB NVMe |
| MacBook Pro | M3 Max | 36GB | 1TB SSD |
"""
    research_path = tmp_path / research_filename
    research_path.write_text(research_content, encoding="utf-8")

    created = auth_client.post(
        "/api/runs",
        json={"goal": "research diffrent website and give me list if best laptop for engineering students"},
    )
    assert created.status_code == 201
    run_id = created.json()["id"]
    run = db.get(Run, run_id)
    run.status = "done"
    run.final_output = f"The report summarizing the best laptops has been saved to '{research_filename}'."
    db.commit()

    step = Step(
        org_id=run.org_id,
        run_id=run.id,
        index=0,
        title="Write research report",
        status="done",
        output=f"Saved report to {research_filename}",
    )
    db.add(step)
    db.commit()

    tool_call = ToolCall(
        org_id=run.org_id,
        step_id=step.id,
        tool_name="write_file",
        arguments={"path": research_filename, "content": research_content},
        status="ok",
        result=f"Successfully wrote {len(research_content)} bytes",
    )
    db.add(tool_call)
    db.commit()

    # Test PDF export of the run
    res = auth_client.get(f"/api/files/export-run/{run.id}?format=pdf")
    assert res.status_code == 200
    pdf_bytes = res.content
    assert len(pdf_bytes) > 0

    # Parse with pypdf to verify it matches actual research, not AcroTech
    pdf_tmp = tmp_path / "test_out.pdf"
    pdf_tmp.write_bytes(pdf_bytes)
    reader = pypdf.PdfReader(str(pdf_tmp))
    extracted = "\n".join(p.extract_text() or "" for p in reader.pages)

    assert "ThinkPad P16" in extracted
    assert "MacBook Pro" in extracted
    assert "AcroTech" not in extracted
    assert "covenant" not in extracted.lower()

    # Test PPTX export of the run
    res_pptx = auth_client.get(f"/api/files/export-run/{run.id}?format=pptx")
    assert res_pptx.status_code == 200
    assert len(res_pptx.content) > 0

    # Test DOCX export of the run
    res_docx = auth_client.get(f"/api/files/export-run/{run.id}?format=docx")
    assert res_docx.status_code == 200
    assert len(res_docx.content) > 0

    # Test HTML export of the run
    res_html = auth_client.get(f"/api/files/export-run/{run.id}?format=html")
    assert res_html.status_code == 200
    assert "ThinkPad P16" in res_html.text
    assert "AcroTech" not in res_html.text
