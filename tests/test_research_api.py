"""Phase 5 collection research API: synthesis, reports, run history, collection Ask."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from passagen.catalog import CatalogService
from passagen.config import LlmSettings
from passagen.external.llm import LlmResponse
from passagen.generation import GenerationRunDispatcher
from passagen.parsing import ParsedPaper, ParsedSection
from passagen.stages.summarization.schema import (
    EvaluationResult,
    StructuredSummary,
    SummaryEvaluation,
    SummaryIdentity,
)
from passagen.storage.database import connect_database

from passagen_web.app import create_app
from passagen_web.config import Settings

PAPERS = {
    "paper-a": ("Fast Scheduler", "latency", "12 ms", 5),
    "paper-b": ("Better Compiler", "speedup", "2.3x", 4),
    "paper-c": ("Graph Partitioner", "edge cut", "18 percent", 8),
}


class CollectionProvider:
    provider_name = "fake"
    model = "fake-collection"

    def __init__(self, shas: dict[str, dict[str, str]], artifact_ids: dict[str, dict[str, str]]):
        self.shas = shas
        self.artifact_ids = artifact_ids
        self.prompts: list[str] = []

    def generate(self, prompt: str, *, max_tokens: int) -> LlmResponse:
        self.prompts.append(prompt)
        if "You rewrite a question" in prompt:
            standalone = (
                prompt.split("<user_question>", 1)[1].split("</user_question>", 1)[0].strip()
            )
            content = json.dumps(
                {
                    "standalone_question": standalone,
                    "retrieval_queries": ["latency"],
                    "requires_exact_quote": False,
                }
            )
        elif "You synthesize only the supplied paper Summary JSON" in prompt:
            content = self._synthesis_payload(prompt)
        elif "You write a structured, source-constrained research report" in prompt:
            content = self._report_payload(prompt)
        else:
            content = self._answer_payload(prompt)
        return LlmResponse(content=content, input_tokens=10, output_tokens=20, finish_reason="stop")

    def _citation(self, paper_id: str, citation_id: str) -> dict[str, object]:
        return {
            "citation_id": citation_id,
            "paper_id": paper_id,
            "artifact_kind": "summary_json",
            "artifact_id": self.artifact_ids[paper_id]["summary_json"],
            "artifact_sha256": self.shas[paper_id]["summary_json"],
            "summary_path": "evaluation.results[0]",
            "page_start": PAPERS[paper_id][3],
        }

    def _answer_payload(self, prompt: str) -> str:
        standalone = prompt.split("<question>", 1)[1].split("</question>", 1)[0].strip()
        return json.dumps(
            {
                "standalone_question": standalone,
                "intent": "fact_lookup",
                "answer_markdown": "Latency dropped to 12 ms [c-1].",
                "claims": [{"text": "Latency was 12 ms.", "citation_ids": ["c-1"]}],
                "citations": [self._citation("paper-a", "c-1")],
                "limitations": [],
                "follow_up_questions": [],
            }
        )

    def _cited_sources(self, prompt: str, marker: str) -> list[str]:
        payload = prompt.split(marker, 1)[1].lstrip()
        documents, _end = json.JSONDecoder().raw_decode(payload)
        paper_ids: list[str] = []
        for document in documents:
            if isinstance(document, dict) and "paper_id" in document:
                paper_ids.append(str(document["paper_id"]))
        return paper_ids or ["paper-a"]

    def _synthesis_payload(self, prompt: str) -> str:
        paper_ids = self._cited_sources(prompt, "SOURCES:")
        citations = [
            self._citation(paper_id, f"c-{index}") for index, paper_id in enumerate(paper_ids)
        ]
        citation_ids = [str(citation["citation_id"]) for citation in citations]
        return json.dumps(
            {
                "schema_version": "1",
                "overview": "The collection studies systems.",
                "themes": [
                    {
                        "name": "Systems",
                        "description": "The papers study systems.",
                        "paper_ids": paper_ids,
                        "citation_ids": citation_ids,
                    }
                ],
                "comparison_matrix": {"dimensions": [], "rows": []},
                "claims": [
                    {"text": "The collection covers systems.", "citation_ids": citation_ids}
                ],
                "citations": citations,
                "coverage": {
                    "included_paper_ids": paper_ids,
                    "missing_summary_paper_ids": [],
                    "partial": False,
                },
            }
        )

    def _report_payload(self, prompt: str) -> str:
        paper_ids = self._cited_sources(prompt, "<sources>")
        citations = [
            self._citation(paper_id, f"c-{index}") for index, paper_id in enumerate(paper_ids)
        ]
        citation_ids = [str(citation["citation_id"]) for citation in citations]
        refs = " ".join(f"[{citation_id}]" for citation_id in citation_ids)
        return json.dumps(
            {
                "schema_version": "1",
                "kind": "review",
                "title": "Generated title",
                "user_prompt": None,
                "synthesis_artifact_id": None,
                "coverage": {
                    "included_paper_ids": paper_ids,
                    "missing_summary_paper_ids": [],
                    "partial": False,
                },
                "sections": [
                    {
                        "heading": "Overview",
                        "body_markdown": f"The papers study systems {refs}.",
                        "claims": [
                            {"text": "The papers study systems.", "citation_ids": citation_ids}
                        ],
                    }
                ],
                "claims": [
                    {"text": "The collection covers systems.", "citation_ids": citation_ids}
                ],
                "citations": citations,
            }
        )


def seed_collection(
    data_dir: Path,
) -> tuple[str, dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    shas: dict[str, dict[str, str]] = {}
    artifact_ids: dict[str, dict[str, str]] = {}
    with connect_database(data_dir / "passagen.db") as connection:
        for index, (paper_id, (title, metric, value, page)) in enumerate(PAPERS.items()):
            parsed = ParsedPaper(
                sections=(
                    ParsedSection(title="1 Introduction", text="Intro text.", pages=(1,)),
                    ParsedSection(
                        title="4 Evaluation",
                        text=f"We measure {metric}. The result was {value}.",
                        pages=(page,),
                    ),
                ),
                parser="fake",
            )
            summary = StructuredSummary(
                identity=SummaryIdentity(title=title),
                evaluation=SummaryEvaluation(
                    results=[
                        EvaluationResult(
                            metric=metric, subject=title, subject_value=value, evidence_pages=[page]
                        )
                    ]
                ),
            )
            paper_dir = data_dir / "papers" / paper_id
            paper_dir.mkdir(parents=True, exist_ok=True)
            contents = {
                "extracted.json": parsed.model_dump_json(),
                "summary.json": summary.model_dump_json(),
            }
            for name, content in contents.items():
                (paper_dir / name).write_text(content, encoding="utf-8")
            connection.execute(
                "INSERT INTO papers (id, title, original_filename, pdf_sha256, status) "
                "VALUES (?, ?, ?, ?, 'summarized')",
                (paper_id, title, f"{paper_id}.pdf", f"{index:x}".zfill(64)),
            )
            shas[paper_id] = {}
            artifact_ids[paper_id] = {}
            for kind, name in (
                ("extracted_json", "extracted.json"),
                ("summary_json", "summary.json"),
            ):
                sha = hashlib.sha256(contents[name].encode()).hexdigest()
                artifact_id = f"art-{paper_id}-{kind}"
                shas[paper_id][kind] = sha
                artifact_ids[paper_id][kind] = artifact_id
                connection.execute(
                    "INSERT INTO artifacts (id, paper_id, kind, path, version, sha256) "
                    "VALUES (?, ?, ?, ?, '1', ?)",
                    (artifact_id, paper_id, kind, f"papers/{paper_id}/{name}", sha),
                )
    catalog = CatalogService(data_dir / "passagen.db", data_dir)
    collection = catalog.create_collection("Systems reading list")
    catalog.add_collection_papers(collection.id, list(PAPERS))
    return collection.id, shas, artifact_ids


def make_client(data_dir: Path) -> TestClient:
    collection_id, shas, artifact_ids = seed_collection(data_dir)
    provider = CollectionProvider(shas, artifact_ids)
    settings = Settings.from_data_dir(data_dir)
    dispatcher = GenerationRunDispatcher(
        settings.database_path,
        settings.data_dir,
        LlmSettings(),
        provider=provider,
    )
    client = TestClient(create_app(settings, dispatcher=dispatcher))
    client.collection_id = collection_id
    return client


def wait_for_run(client: TestClient, run_id: str) -> dict:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        payload: dict = client.get(f"/api/generation-runs/{run_id}").json()
        if payload["status"] in {"completed", "failed", "interrupted"}:
            return payload
        time.sleep(0.05)
    raise AssertionError(f"run {run_id} did not finish")


def test_collection_conversation_scope_and_turn(data_dir: Path) -> None:
    client = make_client(data_dir)
    collection_id = client.collection_id
    with client:
        both = client.post(
            "/api/conversations", json={"paper_id": "paper-a", "collection_id": collection_id}
        )
        assert both.status_code == 422
        neither = client.post("/api/conversations", json={})
        assert neither.status_code == 422

        created = client.post("/api/conversations", json={"collection_id": collection_id})
        assert created.status_code == 201
        conversation = created.json()
        assert conversation["scope"] == "collection"
        assert conversation["paper_id"] is None
        assert conversation["collection_id"] == collection_id

        listing = client.get("/api/conversations", params={"collection_id": collection_id})
        assert [item["id"] for item in listing.json()["items"]] == [conversation["id"]]
        ambiguous = client.get("/api/conversations")
        assert ambiguous.status_code == 422

        submitted = client.post(
            f"/api/conversations/{conversation['id']}/turns",
            json={"question": "What latency was measured?"},
        )
        assert submitted.status_code == 202
        message_id = submitted.json()["message"]["id"]
        deadline = time.monotonic() + 10
        finished: dict = {}
        while time.monotonic() < deadline:
            finished = client.get(
                f"/api/conversations/{conversation['id']}/turns/{message_id}"
            ).json()
            if finished["message"]["status"] in {"completed", "failed"}:
                break
            time.sleep(0.05)
        assert finished["message"]["status"] == "completed"
        assert finished["message"]["citations"][0]["paper_id"] == "paper-a"
        assert set(finished["message"]["selected_paper_ids"]) == set(PAPERS)
        assert finished["message"]["disposition"] == "generated"


def test_synthesis_submit_poll_reuse_and_stale(data_dir: Path) -> None:
    client = make_client(data_dir)
    collection_id = client.collection_id
    with client:
        missing = client.get(f"/api/collections/{collection_id}/synthesis")
        assert missing.status_code == 404

        submitted = client.post(f"/api/collections/{collection_id}/synthesis", json={})
        assert submitted.status_code == 202
        run_id = submitted.json()["run_id"]
        run = wait_for_run(client, run_id)
        assert run["status"] == "completed"
        assert run["kind"] == "collection_synthesis"

        latest = client.get(f"/api/collections/{collection_id}/synthesis")
        assert latest.status_code == 200
        synthesis = latest.json()
        assert synthesis["synthesis"]["overview"] == "The collection studies systems."
        assert synthesis["synthesis"]["coverage"]["partial"] is False
        assert synthesis["source_status"]["stale"] is False
        assert synthesis["synthesis"]["citations"][0]["paper_id"] == "paper-a"

        reused = client.post(f"/api/collections/{collection_id}/synthesis", json={})
        assert reused.status_code == 200
        assert reused.json()["result"]["disposition"] == "reused"

        forced = client.post(f"/api/collections/{collection_id}/synthesis", json={"force": True})
        assert forced.status_code == 202
        assert wait_for_run(client, forced.json()["run_id"])["status"] == "completed"

        summary_path = data_dir / "papers" / "paper-a" / "summary.json"
        content = json.loads(summary_path.read_text(encoding="utf-8"))
        content["evaluation"]["results"][0]["subject_value"] = "99 ms"
        updated = json.dumps(content, ensure_ascii=False)
        summary_path.write_text(updated, encoding="utf-8")
        with connect_database(data_dir / "passagen.db") as connection:
            connection.execute(
                "UPDATE artifacts SET sha256 = ? WHERE id = 'art-paper-a-summary_json'",
                (hashlib.sha256(updated.encode()).hexdigest(),),
            )
        stale = client.get(f"/api/collections/{collection_id}/synthesis").json()
        assert stale["source_status"]["stale"] is True
        assert "summary_content_changed" in stale["source_status"]["reasons"]


def test_synthesis_partial_requires_explicit_opt_in(data_dir: Path) -> None:
    client = make_client(data_dir)
    collection_id = client.collection_id
    with connect_database(data_dir / "passagen.db") as connection:
        connection.execute("DELETE FROM artifacts WHERE id = 'art-paper-c-summary_json'")
    with client:
        rejected = client.post(f"/api/collections/{collection_id}/synthesis", json={})
        assert rejected.status_code == 422
        assert rejected.json()["error"]["code"] == "invalid_scope"

        submitted = client.post(
            f"/api/collections/{collection_id}/synthesis", json={"allow_partial": True}
        )
        assert submitted.status_code == 202
        assert wait_for_run(client, submitted.json()["run_id"])["status"] == "completed"
        synthesis = client.get(f"/api/collections/{collection_id}/synthesis").json()
        coverage = synthesis["synthesis"]["coverage"]
        assert coverage["partial"] is True
        assert coverage["missing_summary_paper_ids"] == ["paper-c"]
        assert set(coverage["included_paper_ids"]) == {"paper-a", "paper-b"}


def test_report_submit_history_detail_and_custom(data_dir: Path) -> None:
    client = make_client(data_dir)
    collection_id = client.collection_id
    with client:
        invalid = client.post(f"/api/collections/{collection_id}/reports", json={"kind": "custom"})
        assert invalid.status_code == 422
        prompt_on_review = client.post(
            f"/api/collections/{collection_id}/reports",
            json={"kind": "review", "user_prompt": "focus on latency"},
        )
        assert prompt_on_review.status_code == 422

        submitted = client.post(
            f"/api/collections/{collection_id}/reports", json={"kind": "review"}
        )
        assert submitted.status_code == 202
        report_id = submitted.json()["report_id"]
        run = wait_for_run(client, submitted.json()["run_id"])
        assert run["status"] == "completed"
        assert run["kind"] == "report"

        history = client.get(f"/api/collections/{collection_id}/reports").json()
        assert [item["record"]["id"] for item in history["items"]] == [report_id]
        assert history["items"][0]["record"]["status"] == "completed"
        assert history["items"][0]["record"]["title"] == "Literature review: Systems reading list"
        assert history["items"][0]["source_status"]["stale"] is False

        detail = client.get(f"/api/collections/{collection_id}/reports/{report_id}")
        assert detail.status_code == 200
        view = detail.json()
        assert view["report"]["kind"] == "review"
        assert view["report"]["sections"][0]["heading"] == "Overview"
        assert view["report"]["coverage"]["partial"] is False
        assert {citation["paper_id"] for citation in view["report"]["citations"]} == set(PAPERS)
        assert {artifact["kind"] for artifact in view["artifacts"]} >= {
            "report_json",
            "report_markdown",
        }

        wrong_scope = client.get(f"/api/collections/other-collection/reports/{report_id}")
        assert wrong_scope.status_code == 404

        reused = client.post(f"/api/collections/{collection_id}/reports", json={"kind": "review"})
        assert reused.status_code == 200
        assert reused.json()["result"]["disposition"] == "reused"

        custom = client.post(
            f"/api/collections/{collection_id}/reports",
            json={"kind": "custom", "user_prompt": "Compare the evaluation setups."},
        )
        assert custom.status_code == 202
        assert wait_for_run(client, custom.json()["run_id"])["status"] == "completed"
        custom_detail = client.get(
            f"/api/collections/{collection_id}/reports/{custom.json()['report_id']}"
        ).json()
        assert custom_detail["record"]["user_prompt"] == "Compare the evaluation setups."


def test_collection_run_history(data_dir: Path) -> None:
    client = make_client(data_dir)
    collection_id = client.collection_id
    with client:
        synthesis = client.post(f"/api/collections/{collection_id}/synthesis", json={})
        assert wait_for_run(client, synthesis.json()["run_id"])["status"] == "completed"
        report = client.post(f"/api/collections/{collection_id}/reports", json={"kind": "gaps"})
        assert wait_for_run(client, report.json()["run_id"])["status"] == "completed"

        runs = client.get(f"/api/collections/{collection_id}/runs").json()["items"]
        by_kind = {item["kind"]: item for item in runs}
        assert set(by_kind) == {"collection_synthesis", "report"}
        assert by_kind["collection_synthesis"]["status"] == "completed"
        assert by_kind["report"]["report_id"] == report.json()["report_id"]
        assert runs[0]["created_at"] >= runs[-1]["created_at"]


def test_restart_interrupts_active_runs_and_reports(data_dir: Path) -> None:
    client = make_client(data_dir)
    collection_id = client.collection_id
    with client:
        submitted = client.post(
            f"/api/collections/{collection_id}/reports", json={"kind": "review"}
        )
        report_id = submitted.json()["report_id"]
        run_id = submitted.json()["run_id"]
        assert wait_for_run(client, run_id)["status"] == "completed"

    with connect_database(data_dir / "passagen.db") as connection:
        connection.execute(
            "UPDATE generation_runs SET status = 'running', completed_at = NULL WHERE id = ?",
            (run_id,),
        )
        connection.execute(
            "UPDATE collection_reports SET status = 'running', completed_at = NULL WHERE id = ?",
            (report_id,),
        )

    restarted = TestClient(create_app(Settings.from_data_dir(data_dir)))
    with restarted:
        run = restarted.get(f"/api/generation-runs/{run_id}").json()
        assert run["status"] == "interrupted"
        report = restarted.get(f"/api/collections/{collection_id}/reports/{report_id}").json()
        assert report["record"]["status"] == "failed"
        assert "interrupted" in report["record"]["error"]
