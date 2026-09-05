from __future__ import annotations

import hashlib
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from passagen.domain import Paper, PaperStatus
from passagen.processing import ProcessingService
from passagen.providers import ProviderHealthSnapshot
from passagen.stages.updating import UpdateEvent, UpdateResult
from passagen.storage.repository import register_pdf

from passagen_web.app import create_app
from passagen_web.config import Settings


@pytest.fixture(autouse=True)
def fast_runner(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "passagen_web.runner.check_provider_health",
        lambda _providers: ProviderHealthSnapshot({}),
    )


def add_paper(data_dir: Path, name: str) -> str:
    paper = Paper(
        original_filename=name,
        pdf_sha256=hashlib.sha256(name.encode()).hexdigest(),
        file_size_bytes=1,
    )
    register_pdf(data_dir / "passagen.db", paper, Path("pdfs") / "aa" / f"{paper.pdf_sha256}.pdf")
    return paper.id


def fake_update_result(*_args: object, **kwargs: object) -> UpdateResult:
    on_event = kwargs.get("on_event")
    if callable(on_event):
        on_event(UpdateEvent(None, "update", 0, 1, "fake progress"))
    return UpdateResult(target_status=PaperStatus.OUTLINED)


def wait_for_status(client: TestClient, run_id: str, statuses: set[str]) -> dict:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        payload: dict = client.get(f"/api/processing-runs/{run_id}").json()
        if payload["status"] in statuses:
            return payload
        time.sleep(0.05)
    raise AssertionError(f"run {run_id} did not reach {statuses}")


def test_create_run_returns_202_and_completes(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("passagen.processing.service.update_papers", fake_update_result)
    paper_id = add_paper(data_dir, "paper.pdf")
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.post(
            "/api/processing-runs", json={"paper_ids": [paper_id], "mode": "continue"}
        )
        assert response.status_code == 202
        run = response.json()
        assert run["status"] in {"queued", "running", "completed"}
        assert run["paper_ids"] == [paper_id]

        finished = wait_for_status(client, run["id"], {"completed", "failed"})
        assert finished["status"] == "completed"
        assert finished["finished_at"] is not None
        assert finished["result"] == {
            "updated": [],
            "skipped": [],
            "failed": [],
            "warnings": [],
        }

        events = client.get(f"/api/processing-runs/{run['id']}/events").json()["items"]
        assert [event["sequence"] for event in events] == list(range(1, len(events) + 1))
        assert any("fake progress" in event["message"] for event in events)

        runs = client.get("/api/processing-runs").json()["items"]
        assert [item["id"] for item in runs] == [run["id"]]
        assert client.get(f"/api/processing-runs?paper_id={paper_id}").json()["items"]
        assert client.get("/api/processing-runs?status=failed").json()["items"] == []

        outline = client.post(
            "/api/processing-runs",
            json={"paper_ids": [paper_id], "mode": "rebuild", "from_stage": "outline"},
        )
        assert outline.status_code == 202
        assert outline.json()["from_stage"] == "outline"
        assert wait_for_status(client, outline.json()["id"], {"completed"})["status"] == "completed"

        abstract = client.post(
            "/api/processing-runs",
            json={"paper_ids": [paper_id], "mode": "rebuild", "from_stage": "abstract"},
        )
        assert abstract.status_code == 202
        assert abstract.json()["from_stage"] == "abstract"
        abstract_run = wait_for_status(client, abstract.json()["id"], {"completed"})
        assert abstract_run["status"] == "completed"


def test_create_run_conflict_returns_409(data_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    blocker = threading.Event()

    def blocking_update(*_args: object, **kwargs: object) -> UpdateResult:
        blocker.wait(timeout=10)
        return UpdateResult(target_status=PaperStatus.OUTLINED)

    monkeypatch.setattr("passagen.processing.service.update_papers", blocking_update)
    paper_id = add_paper(data_dir, "paper.pdf")
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        first = client.post("/api/processing-runs", json={"paper_ids": [paper_id]})
        assert first.status_code == 202
        wait_for_status(client, first.json()["id"], {"running"})

        conflict = client.post("/api/processing-runs", json={"paper_ids": [paper_id]})
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "run_conflict"

        blocker.set()
        wait_for_status(client, first.json()["id"], {"completed"})


def test_create_run_validates_input(data_dir: Path) -> None:
    paper_id = add_paper(data_dir, "paper.pdf")
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        unknown = client.post("/api/processing-runs", json={"paper_ids": ["missing"]})
        assert unknown.status_code == 404

        bad_mode = client.post(
            "/api/processing-runs",
            json={"paper_ids": [paper_id], "mode": "continue", "from_stage": "parse"},
        )
        assert bad_mode.status_code == 400

        empty = client.post("/api/processing-runs", json={"paper_ids": []})
        assert empty.status_code == 422

        missing = client.get("/api/processing-runs/does-not-exist")
        assert missing.status_code == 404
        missing_events = client.get("/api/processing-runs/does-not-exist/events")
        assert missing_events.status_code == 404


def test_queued_runs_are_interrupted_on_restart(data_dir: Path) -> None:
    paper_id = add_paper(data_dir, "paper.pdf")
    service = ProcessingService(Settings.from_data_dir(data_dir).core)
    run = service.start_update([paper_id])
    assert run.status.value == "queued"

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        payload = client.get(f"/api/processing-runs/{run.id}").json()
        assert payload["status"] == "interrupted"
        assert payload["finished_at"] is not None


def test_import_pdf_uploads(data_dir: Path) -> None:
    valid = b"%PDF-1.7\nbody\n%%EOF\n"
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.post(
            "/api/papers/import",
            files=[
                ("files", ("paper.pdf", valid, "application/pdf")),
                ("files", ("notes.txt", b"not a pdf", "text/plain")),
            ],
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["added"]) == 1
        assert payload["duplicates"] == []
        assert payload["failed"] == [
            {
                "filename": "notes.txt",
                "reason": "not_a_pdf",
                "message": payload["failed"][0]["message"],
            }
        ]

        duplicate = client.post(
            "/api/papers/import",
            files=[("files", ("paper-again.pdf", valid, "application/pdf"))],
        )
        assert duplicate.status_code == 200
        assert duplicate.json()["duplicates"] == payload["added"]
        assert duplicate.json()["added"] == []

        paper = client.get(f"/api/papers/{payload['added'][0]}").json()
        assert paper["status"] == "discovered"
        assert paper["original_filename"] == "paper.pdf"
