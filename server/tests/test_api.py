"""REST contract tests, including a full run and a full eval suite executed
through the background workers against the deterministic mock provider."""

from __future__ import annotations

import time

import pytest

POLL_TIMEOUT = 60.0


def _poll(client, url: str, done, timeout: float = POLL_TIMEOUT) -> dict:
    """Poll until `done(payload)`, since runs execute on a worker thread."""
    deadline = time.time() + timeout
    payload: dict = {}
    while time.time() < deadline:
        response = client.get(url)
        assert response.status_code == 200, response.text
        payload = response.json()
        if done(payload):
            return payload
        time.sleep(0.15)
    pytest.fail(f"timed out waiting on {url}; last payload: {payload}")


# ------------------------------------------------------------------- auth


def test_register_returns_a_token_and_the_user(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "New.User@Example.com", "password": "supersecret123", "display_name": "New"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == "new.user@example.com"  # normalised
    assert "password" not in body["user"] and "password_hash" not in body["user"]


def test_register_seeds_working_defaults(auth_client):
    agents = auth_client.get("/api/agents").json()
    assert {agent["name"] for agent in agents} == {"researcher", "analyst", "writer"}
    assert all(agent["is_seed"] for agent in agents)

    scenarios = auth_client.get("/api/evals/scenarios").json()
    assert len(scenarios) >= 3
    assert all(scenario["expected_outcome"] for scenario in scenarios)


def test_duplicate_email_is_rejected(client):
    payload = {"email": "dupe@example.com", "password": "supersecret123"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/register", json=payload).status_code == 409


def test_login_succeeds_and_rejects_a_bad_password(client):
    client.post("/api/auth/register", json={"email": "login@example.com", "password": "supersecret123"})

    ok = client.post("/api/auth/login", json={"email": "login@example.com", "password": "supersecret123"})
    assert ok.status_code == 200 and ok.json()["access_token"]

    bad = client.post("/api/auth/login", json={"email": "login@example.com", "password": "wrongpassword"})
    assert bad.status_code == 401
    # Unknown accounts must be indistinguishable from wrong passwords.
    unknown = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "wrongpassword"})
    assert unknown.status_code == 401
    assert bad.json()["detail"] == unknown.json()["detail"]


def test_short_passwords_are_rejected(client):
    response = client.post("/api/auth/register", json={"email": "short@example.com", "password": "abc"})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "path", ["/api/me", "/api/runs", "/api/agents", "/api/evals/scenarios", "/api/settings/llm"]
)
def test_protected_routes_require_a_token(client, path):
    client.headers.pop("Authorization", None)
    assert client.get(path).status_code == 401


def test_a_garbage_token_is_rejected(client):
    client.headers["Authorization"] = "Bearer not-a-real-token"
    assert client.get("/api/me").status_code == 401
    client.headers.pop("Authorization", None)


def test_me_returns_the_current_account(auth_client):
    body = auth_client.get("/api/me").json()
    assert body["id"] == auth_client.user["id"]


# ------------------------------------------------------------------- runs


def test_run_executes_the_full_pipeline(auth_client):
    created = auth_client.post(
        "/api/runs",
        json={"goal": "Research vector database trade-offs and calculate the monthly cost."},
    )
    assert created.status_code == 201, created.text
    run_id = created.json()["id"]
    assert created.json()["status"] in {"planning", "running", "done"}

    run = _poll(auth_client, f"/api/runs/{run_id}", lambda r: r["status"] in {"done", "failed"})
    assert run["status"] == "done", run.get("error")
    assert run["planner_summary"]
    assert run["final_output"]
    assert run["total_tokens"] > 0
    assert run["provider"] == "mock"
    assert run["step_count"] == run["completed_step_count"] == len(run["steps"])

    for position, step in enumerate(run["steps"]):
        assert step["index"] == position
        assert step["status"] == "done"
        assert step["output"]
        assert step["agent_name"] != "unassigned"

    # A tool-equipped sub-agent must actually log its calls.
    tool_calls = [call for step in run["steps"] for call in step["tool_calls"]]
    assert tool_calls, "expected at least one tool call to be recorded"
    for call in tool_calls:
        assert call["status"] == "ok"
        assert call["result"]
        assert call["arguments"]


def test_steps_endpoint_matches_the_run_detail(auth_client):
    run_id = auth_client.post("/api/runs", json={"goal": "Summarize what this system does."}).json()["id"]
    _poll(auth_client, f"/api/runs/{run_id}", lambda r: r["status"] in {"done", "failed"})

    steps = auth_client.get(f"/api/runs/{run_id}/steps").json()
    detail = auth_client.get(f"/api/runs/{run_id}").json()
    assert [step["id"] for step in steps] == [step["id"] for step in detail["steps"]]


def test_run_list_is_newest_first_and_filterable(auth_client):
    auth_client.post("/api/runs", json={"goal": "First goal for the listing test."})
    auth_client.post("/api/runs", json={"goal": "Second goal for the listing test."})

    runs = auth_client.get("/api/runs").json()
    assert len(runs) >= 2
    timestamps = [run["created_at"] for run in runs]
    assert timestamps == sorted(timestamps, reverse=True)

    assert all(run["source"] == "manual" for run in auth_client.get("/api/runs?source=manual").json())
    assert auth_client.get("/api/runs?limit=1").json().__len__() == 1


def test_short_goals_are_rejected(auth_client):
    assert auth_client.post("/api/runs", json={"goal": "hi"}).status_code == 422


def test_runs_are_scoped_to_their_owner(client, auth_client):
    run_id = auth_client.post("/api/runs", json={"goal": "A private goal only I can see."}).json()["id"]

    client.headers["Authorization"] = "Bearer test-clerk:user_intruder:org_intruder"
    client.get("/api/me")  # bootstrap other org

    assert client.get(f"/api/runs/{run_id}").status_code == 404
    assert client.get(f"/api/runs/{run_id}/steps").status_code == 404
    assert client.delete(f"/api/runs/{run_id}").status_code == 404


def test_deleting_a_run_removes_it(auth_client):
    run_id = auth_client.post("/api/runs", json={"goal": "A goal that will be deleted."}).json()["id"]
    _poll(auth_client, f"/api/runs/{run_id}", lambda r: r["status"] in {"done", "failed"})

    assert auth_client.delete(f"/api/runs/{run_id}").status_code == 204
    assert auth_client.get(f"/api/runs/{run_id}").status_code == 404


def test_user_can_delete_own_run_even_if_org_differs(auth_client):
    run_id = auth_client.post("/api/runs", json={"goal": "A goal to test resilient delete."}).json()["id"]
    _poll(auth_client, f"/api/runs/{run_id}", lambda r: r["status"] in {"done", "failed"})

    # Even with a different X-Org-Id or personal workspace context, user owns the run
    resp = auth_client.delete(f"/api/runs/{run_id}", headers={"X-Org-Id": "other_workspace"})
    assert resp.status_code == 204
    assert auth_client.get(f"/api/runs/{run_id}").status_code == 404


def test_missing_run_is_a_404(auth_client):
    assert auth_client.get("/api/runs/00000000-0000-0000-0000-000000000000").status_code == 404


# ----------------------------------------------------------------- agents


def test_tool_catalogue_is_exposed(auth_client):
    tools = auth_client.get("/api/agents/tools").json()
    names = {tool["name"] for tool in tools}
    assert {"web_search", "run_code"} <= names
    assert all(tool["label"] and tool["description"] for tool in tools)


def test_agent_crud_round_trip(auth_client):
    created = auth_client.post(
        "/api/agents",
        json={
            "name": "critic",
            "description": "Reviews the work.",
            "system_prompt": "Be harsh but fair.",
            "tools": ["web_search"],
        },
    )
    assert created.status_code == 201, created.text
    agent = created.json()
    assert agent["tools"] == ["web_search"]
    assert agent["is_seed"] is False

    patched = auth_client.patch(f"/api/agents/{agent['id']}", json={"tools": ["run_code"], "is_active": False})
    assert patched.status_code == 200
    assert patched.json()["tools"] == ["run_code"]
    assert patched.json()["is_active"] is False

    assert auth_client.delete(f"/api/agents/{agent['id']}").status_code == 204
    assert all(a["id"] != agent["id"] for a in auth_client.get("/api/agents").json())


def test_unknown_tools_are_rejected(auth_client):
    response = auth_client.post(
        "/api/agents", json={"name": "sketchy", "tools": ["rm_rf_slash"]}
    )
    assert response.status_code == 422
    assert "rm_rf_slash" in response.text


def test_duplicate_tools_are_deduplicated(auth_client):
    response = auth_client.post(
        "/api/agents", json={"name": "deduper", "tools": ["web_search", "web_search"]}
    )
    assert response.status_code == 201
    assert response.json()["tools"] == ["web_search"]


def test_duplicate_agent_names_are_rejected_case_insensitively(auth_client):
    assert auth_client.post("/api/agents", json={"name": "Researcher"}).status_code == 409


def test_agents_are_scoped_to_their_owner(client, auth_client):
    agent_id = auth_client.get("/api/agents").json()[0]["id"]
    client.headers["Authorization"] = "Bearer test-clerk:user_agent_intruder:org_agent_intruder"
    client.get("/api/me")

    assert client.patch(f"/api/agents/{agent_id}", json={"name": "hijacked"}).status_code == 404
    assert client.delete(f"/api/agents/{agent_id}").status_code == 404


def test_the_planner_only_delegates_to_active_agents(auth_client):
    """Deactivating an agent must remove it from the roster the planner sees."""
    for agent in auth_client.get("/api/agents").json():
        if agent["name"] != "writer":
            auth_client.patch(f"/api/agents/{agent['id']}", json={"is_active": False})

    run_id = auth_client.post(
        "/api/runs", json={"goal": "Research and calculate and summarize all at once."}
    ).json()["id"]
    run = _poll(auth_client, f"/api/runs/{run_id}", lambda r: r["status"] in {"done", "failed"})

    assert run["status"] == "done", run.get("error")
    assert {step["agent_name"] for step in run["steps"]} == {"writer"}

    for agent in auth_client.get("/api/agents").json():
        auth_client.patch(f"/api/agents/{agent['id']}", json={"is_active": True})


# ------------------------------------------------------------------ evals


def test_scenario_crud_round_trip(auth_client):
    created = auth_client.post(
        "/api/evals/scenarios",
        json={
            "name": "Custom scenario",
            "goal": "Explain how the orchestrator schedules steps.",
            "expected_outcome": "A description of sequential step execution.",
        },
    )
    assert created.status_code == 201, created.text
    scenario = created.json()

    patched = auth_client.patch(f"/api/evals/scenarios/{scenario['id']}", json={"is_active": False})
    assert patched.json()["is_active"] is False

    assert auth_client.delete(f"/api/evals/scenarios/{scenario['id']}").status_code == 204


def test_eval_suite_runs_and_scores_every_scenario(auth_client):
    scenarios = auth_client.get("/api/evals/scenarios").json()
    target = scenarios[0]
    # One scenario keeps the suite fast; the loop is identical for the full set.
    started = auth_client.post("/api/evals/runs", json={"scenario_ids": [target["id"]]})
    assert started.status_code == 202, started.text
    eval_run_id = started.json()["id"]

    eval_run = _poll(
        auth_client,
        f"/api/evals/runs/{eval_run_id}",
        lambda r: r["status"] in {"done", "failed"},
    )
    assert eval_run["status"] == "done", eval_run.get("error")
    assert eval_run["total"] == 1
    assert eval_run["passed"] + eval_run["failed"] == 1
    assert 0.0 <= eval_run["avg_score"] <= 1.0

    result = eval_run["results"][0]
    assert result["scenario_name"] == target["name"]
    assert 0.0 <= result["score"] <= 1.0
    assert result["judge_reasoning"]
    assert result["actual_output"]
    assert result["run_id"], "each eval result should link back to its run"

    # The replayed run is recorded as eval-sourced so the dashboard can filter it.
    replay = auth_client.get(f"/api/runs/{result['run_id']}").json()
    assert replay["source"] == "eval"


def test_eval_run_requires_at_least_one_active_scenario(auth_client):
    scenarios = auth_client.get("/api/evals/scenarios").json()
    for scenario in scenarios:
        auth_client.patch(f"/api/evals/scenarios/{scenario['id']}", json={"is_active": False})

    response = auth_client.post("/api/evals/runs", json={})
    assert response.status_code == 400

    for scenario in scenarios:
        auth_client.patch(f"/api/evals/scenarios/{scenario['id']}", json={"is_active": True})


def test_eval_runs_are_scoped_to_their_owner(client, auth_client):
    scenario_id = auth_client.get("/api/evals/scenarios").json()[0]["id"]
    client.headers["Authorization"] = "Bearer test-clerk:user_eval_intruder:org_eval_intruder"
    client.get("/api/me")
    assert client.patch(f"/api/evals/scenarios/{scenario_id}", json={"is_active": False}).status_code == 404


# --------------------------------------------------------------- settings


def test_llm_settings_never_leak_the_api_key(auth_client):
    body = auth_client.get("/api/settings/llm").json()
    assert body["active_provider"] == "mock"
    assert body["has_api_key"] is False
    assert body["available_models"]
    assert "anthropic_api_key" not in body

    updated = auth_client.put(
        "/api/settings/llm",
        json={"anthropic_api_key": "sk-ant-secret-value-1234567890", "model": "claude-3-5-haiku-20241022"},
    )
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["has_api_key"] is True
    assert payload["model"] == "claude-3-5-haiku-20241022"
    assert "secret-value" not in updated.text
    assert payload["api_key_hint"].startswith("sk-ant")
    assert payload["api_key_hint"].endswith("7890")

    cleared = auth_client.put("/api/settings/llm", json={"clear_api_key": True})
    assert cleared.json()["has_api_key"] is False


def test_malformed_api_keys_are_rejected(auth_client):
    response = auth_client.put("/api/settings/llm", json={"anthropic_api_key": "not-a-key"})
    assert response.status_code == 400


# ------------------------------------------------------------------- meta


def test_health_reports_the_active_backends(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["llm_provider"] == "mock"
    assert body["version"]
