from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from passagen.assistant import ConversationService
from passagen.config import LlmSettings
from passagen.external.llm import LlmProviderError, LlmResponse
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


class FakeProvider:
    provider_name = "fake"
    model = "fake-model"

    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.summary_sha = ""

    def generate(self, prompt: str, *, max_tokens: int) -> LlmResponse:
        if "You rewrite a question" in prompt:
            if self.fail:
                raise LlmProviderError("provider timeout")
            standalone = (
                prompt.split("<user_question>", 1)[1].split("</user_question>", 1)[0].strip()
            )
            return LlmResponse(
                content=json.dumps(
                    {
                        "standalone_question": standalone,
                        "retrieval_queries": ["latency"],
                        "requires_exact_quote": False,
                    }
                ),
                input_tokens=5,
                output_tokens=5,
                finish_reason="stop",
            )
        if "failed validation" in prompt:
            raise AssertionError("repair should not be needed")
        standalone = prompt.split("<question>", 1)[1].split("</question>", 1)[0].strip()
        return LlmResponse(
            content=json.dumps(
                {
                    "standalone_question": standalone,
                    "intent": "overview",
                    "answer_markdown": "The latency result was 12 ms [c-1].",
                    "claims": [{"text": "Latency was 12 ms.", "citation_ids": ["c-1"]}],
                    "citations": [
                        {
                            "citation_id": "c-1",
                            "paper_id": "paper-1",
                            "artifact_kind": "summary_json",
                            "artifact_id": "art-summary",
                            "artifact_sha256": self.summary_sha,
                            "summary_path": "evaluation.results[0]",
                            "page_start": 5,
                        }
                    ],
                    "limitations": [],
                    "follow_up_questions": [],
                }
            ),
            input_tokens=50,
            output_tokens=20,
            finish_reason="stop",
        )


def seed_paper(data_dir: Path) -> str:
    parsed = ParsedPaper(
        sections=(
            ParsedSection(
                title="4.2 Latency Evaluation",
                text="Latency dropped to 12 ms.",
                pages=(5,),
            ),
        ),
        parser="fake",
    )
    summary = StructuredSummary(
        identity=SummaryIdentity(title="A Paper"),
        evaluation=SummaryEvaluation(
            results=[
                EvaluationResult(
                    metric="latency",
                    subject="scheduler",
                    subject_value="12 ms",
                    evidence_pages=[5],
                )
            ]
        ),
    )
    paper_dir = data_dir / "papers" / "paper-1"
    paper_dir.mkdir(parents=True, exist_ok=True)
    contents = {
        "extracted.json": parsed.model_dump_json(),
        "summary.json": summary.model_dump_json(),
    }
    for name, content in contents.items():
        (paper_dir / name).write_text(content, encoding="utf-8")

    def sha(name: str) -> str:
        return hashlib.sha256(contents[name].encode()).hexdigest()

    with connect_database(data_dir / "passagen.db") as connection:
        existing = connection.execute("SELECT id FROM papers WHERE id = 'paper-1'").fetchone()
        if existing is None:
            connection.execute(
                "INSERT INTO papers (id, original_filename, pdf_sha256, status) "
                "VALUES ('paper-1', 'a.pdf', ?, 'summarized')",
                ("f" * 64,),
            )
            for artifact_id, kind, name, version in (
                ("art-extracted", "extracted_json", "extracted.json", "1"),
                ("art-summary", "summary_json", "summary.json", "2"),
            ):
                connection.execute(
                    "INSERT INTO artifacts (id, paper_id, kind, path, version, sha256) "
                    "VALUES (?, 'paper-1', ?, ?, ?, ?)",
                    (artifact_id, kind, f"papers/paper-1/{name}", version, sha(name)),
                )
    return sha("summary.json")


def make_client(data_dir: Path, *, fail_provider: bool = False) -> tuple[TestClient, FakeProvider]:
    provider = FakeProvider(fail=fail_provider)
    provider.summary_sha = seed_paper(data_dir)
    settings = Settings.from_data_dir(data_dir)
    assistant = ConversationService(
        settings.database_path, settings.data_dir, LlmSettings(), provider=provider
    )
    return TestClient(create_app(settings, assistant=assistant)), provider


def wait_for_turn(client: TestClient, conversation_id: str, message_id: str) -> dict:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        payload: dict = client.get(
            f"/api/conversations/{conversation_id}/turns/{message_id}"
        ).json()
        if payload["message"]["status"] in {"completed", "failed"}:
            return payload
        time.sleep(0.05)
    raise AssertionError(f"turn {message_id} did not finish")


def test_conversation_crud(data_dir: Path) -> None:
    client, _provider = make_client(data_dir)
    with client:
        created = client.post("/api/conversations", json={"paper_id": "paper-1"})
        assert created.status_code == 201
        conversation = created.json()
        assert conversation["title"] == "New conversation"

        listing = client.get("/api/conversations", params={"paper_id": "paper-1"})
        assert [item["id"] for item in listing.json()["items"]] == [conversation["id"]]

        renamed = client.patch(
            f"/api/conversations/{conversation['id']}", json={"title": "Latency"}
        )
        assert renamed.json()["title"] == "Latency"

        detail = client.get(f"/api/conversations/{conversation['id']}")
        assert detail.json()["messages"] == []

        deleted = client.delete(f"/api/conversations/{conversation['id']}")
        assert deleted.status_code == 204
        assert (
            client.get("/api/conversations", params={"paper_id": "paper-1"}).json()["items"] == []
        )


def test_turn_returns_202_and_completes_with_sources(data_dir: Path) -> None:
    client, _provider = make_client(data_dir)
    with client:
        conversation_id = client.post("/api/conversations", json={"paper_id": "paper-1"}).json()[
            "id"
        ]

        submitted = client.post(
            f"/api/conversations/{conversation_id}/turns", json={"question": "主要贡献是什么？"}
        )

        assert submitted.status_code == 202
        message_id = submitted.json()["message"]["id"]
        run_id = submitted.json()["run"]["id"]

        finished = wait_for_turn(client, conversation_id, message_id)
        assert finished["message"]["status"] == "completed"
        assert "12 ms" in finished["message"]["content"]
        assert finished["message"]["sources"] == ["summary"]
        assert finished["message"]["qa_record_id"]
        assert finished["message"]["archived"] is False
        assert finished["message"]["citations"][0]["page_start"] == 5
        assert finished["message"]["llm_call_count"] == 2
        assert finished["message"]["output_tokens"] == 25
        assert finished["run"]["status"] == "completed"
        assert finished["run"]["llm_call_count"] == 2

        detail = client.get(f"/api/conversations/{conversation_id}").json()
        assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
        assert detail["messages"][0]["content"] == "主要贡献是什么？"

        run = client.get(f"/api/generation-runs/{run_id}").json()
        assert run["status"] == "completed"
        assert [call["stage"] for call in run["llm_calls"]] == ["rewrite", "answer"]
        assert run["output_tokens"] == 25


def test_turn_failure_surfaces_stable_error(data_dir: Path) -> None:
    client, _provider = make_client(data_dir, fail_provider=True)
    with client:
        conversation_id = client.post("/api/conversations", json={"paper_id": "paper-1"}).json()[
            "id"
        ]
        submitted = client.post(
            f"/api/conversations/{conversation_id}/turns", json={"question": "问题？"}
        )
        message_id = submitted.json()["message"]["id"]

        finished = wait_for_turn(client, conversation_id, message_id)

        assert finished["message"]["status"] == "failed"
        assert finished["message"]["error_code"] == "provider_error"
        detail = client.get(f"/api/conversations/{conversation_id}").json()
        assert detail["messages"][0]["content"] == "问题？"


def test_archive_search_and_export(data_dir: Path) -> None:
    client, _provider = make_client(data_dir)
    with client:
        conversation_id = client.post("/api/conversations", json={"paper_id": "paper-1"}).json()[
            "id"
        ]
        submitted = client.post(
            f"/api/conversations/{conversation_id}/turns", json={"question": "主要贡献是什么？"}
        )
        finished = wait_for_turn(client, conversation_id, submitted.json()["message"]["id"])
        record_id = finished["message"]["qa_record_id"]

        archived = client.patch(
            f"/api/qa-records/{record_id}",
            json={"archived": True, "title": "Latency result", "tags": ["eval"]},
        )
        assert archived.status_code == 200
        assert archived.json()["archive_title"] == "Latency result"
        assert archived.json()["citation_count"] == 1

        hits = client.get("/api/qa-records", params={"archived": True, "q": "贡献"})
        assert [item["id"] for item in hits.json()["items"]] == [record_id]
        misses = client.get("/api/qa-records", params={"archived": False})
        assert misses.json()["items"] == []

        exported = client.get(f"/api/qa-records/{record_id}")
        assert exported.json()["archive_title"] == "Latency result"
        assert exported.json()["source_fingerprint"]

        unarchived = client.patch(f"/api/qa-records/{record_id}", json={"archived": False})
        assert unarchived.json()["archived_at"] is None


def test_archive_without_title_is_rejected(data_dir: Path) -> None:
    client, _provider = make_client(data_dir)
    with client:
        conversation_id = client.post("/api/conversations", json={"paper_id": "paper-1"}).json()[
            "id"
        ]
        submitted = client.post(
            f"/api/conversations/{conversation_id}/turns", json={"question": "主要贡献是什么？"}
        )
        finished = wait_for_turn(client, conversation_id, submitted.json()["message"]["id"])

        response = client.patch(
            f"/api/qa-records/{finished['message']['qa_record_id']}", json={"archived": True}
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_scope"


def test_submit_turn_validates_input(data_dir: Path) -> None:
    client, _provider = make_client(data_dir)
    with client:
        missing = client.post("/api/conversations/missing/turns", json={"question": "问题？"})
        assert missing.status_code == 404
        assert missing.json()["error"]["code"] == "not_found"

        conversation_id = client.post("/api/conversations", json={"paper_id": "paper-1"}).json()[
            "id"
        ]
        blank = client.post(f"/api/conversations/{conversation_id}/turns", json={"question": "   "})
        assert blank.status_code == 422


def test_legacy_running_runs_are_interrupted_on_startup(data_dir: Path) -> None:
    client, _provider = make_client(data_dir)
    with client:
        conversation_id = client.post("/api/conversations", json={"paper_id": "paper-1"}).json()[
            "id"
        ]
        submitted = client.post(
            f"/api/conversations/{conversation_id}/turns", json={"question": "问题？"}
        )
        run_id = submitted.json()["run"]["id"]
        wait_for_turn(client, conversation_id, submitted.json()["message"]["id"])

    with connect_database(data_dir / "passagen.db") as connection:
        connection.execute(
            "UPDATE generation_runs SET status = 'running', completed_at = NULL WHERE id = ?",
            (run_id,),
        )

    restarted, _provider = make_client(data_dir)
    with restarted:
        run = restarted.get(f"/api/generation-runs/{run_id}").json()
        assert run["status"] == "interrupted"
