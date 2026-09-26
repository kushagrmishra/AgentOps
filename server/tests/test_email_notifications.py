from __future__ import annotations

from app.services.emails import send_run_completion_alert, send_run_failure_alert


def test_email_alerts_dispatch_without_error(monkeypatch):
    sent_messages = []

    def fake_send(to: str, subject: str, html: str):
        sent_messages.append({"to": to, "subject": subject, "html": html})

    monkeypatch.setattr("app.services.emails._send", fake_send)

    send_run_completion_alert(
        email="founder@agentops.dev",
        goal="Perform SEC 10-K Competitive Risk Analysis",
        run_id="run-test-email-1",
        summary="Completed analysis in 3 steps with 100% test coverage.",
    )
    assert len(sent_messages) == 1
    assert sent_messages[0]["to"] == "founder@agentops.dev"
    assert "Completed" in sent_messages[0]["subject"]
    assert "SEC 10-K" in sent_messages[0]["html"]

    send_run_failure_alert(
        email="founder@agentops.dev",
        goal="Scrape forbidden portal",
        run_id="run-test-email-2",
        error="AccessDeniedException: 403 Forbidden",
    )
    assert len(sent_messages) == 2
    assert sent_messages[1]["to"] == "founder@agentops.dev"
    assert "Failed" in sent_messages[1]["subject"]
    assert "AccessDeniedException" in sent_messages[1]["html"]
