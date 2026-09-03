import json
from pathlib import Path

from fastapi.testclient import TestClient
from passagen.catalog import CatalogService
from passagen.storage.database import connect_database

from passagen_web.app import create_app
from passagen_web.config import Settings


def _insert_paper(
    data_dir: Path,
    paper_id: str,
    *,
    title: str,
    year: int,
    venue: str,
    status: str = "summarized",
) -> None:
    with connect_database(data_dir / "passagen.db") as connection:
        connection.execute(
            """
            INSERT INTO papers
                (id, title, authors_json, year, venue, original_filename, pdf_sha256, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                paper_id,
                title,
                json.dumps(["Ada Author"]),
                year,
                venue,
                f"{paper_id}.pdf",
                paper_id.ljust(64, "0"),
                status,
            ),
        )


def _insert_artifact(
    data_dir: Path, paper_id: str, kind: str, relative_path: str, content: bytes
) -> None:
    path = data_dir / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    with connect_database(data_dir / "passagen.db") as connection:
        connection.execute(
            """
            INSERT INTO artifacts (id, paper_id, kind, path, size_bytes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (f"{paper_id}-{kind}", paper_id, kind, relative_path, len(content)),
        )


def test_list_papers_filters_sorts_and_never_returns_paths(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha System", year=2022, venue="SOSP")
    _insert_paper(data_dir, "paper-b", title="Beta System", year=2024, venue="SOSP")
    _insert_paper(data_dir, "paper-c", title="Other Work", year=2023, venue="OSDI")
    _insert_artifact(data_dir, "paper-b", "summary_json", "summaries/b.json", b"not read")
    catalog = CatalogService(data_dir / "passagen.db", data_dir)
    tag = catalog.create_tag("Systems")
    catalog.set_paper_tags("paper-b", [tag.id])
    collection = catalog.create_collection("Reading")
    catalog.add_collection_papers(collection.id, ["paper-b"])

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get(
            "/api/papers",
            params={
                "q": "system",
                "venue": "SOSP",
                "tag": tag.id,
                "collection": collection.id,
                "sort": "year",
                "direction": "desc",
                "limit": 1,
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == "paper-b"
    assert body["items"][0]["artifacts"] == {
        "summary": True,
        "outline": False,
        "pdf": False,
    }
    assert "summaries/b.json" not in response.text


def test_paper_detail_and_not_found_error_are_stable(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        detail = client.get("/api/papers/paper-a")
        missing = client.get("/api/papers/missing")

    assert detail.status_code == 200
    assert detail.json()["authors"] == ["Ada Author"]
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"


def test_summary_is_validated_before_it_is_returned(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")
    _insert_artifact(
        data_dir,
        "paper-a",
        "summary_json",
        "summaries/a.json",
        b'{"schema_version":"2","identity":{"title":"Alpha"}}',
    )

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/papers/paper-a/summary")

    assert response.status_code == 200
    assert response.json()["content"]["schema_version"] == "2"
    assert response.json()["content"]["identity"]["title"] == "Alpha"


def test_invalid_summary_returns_stable_artifact_error(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")
    _insert_artifact(
        data_dir,
        "paper-a",
        "summary_json",
        "summaries/a.json",
        b'{"schema_version":"1"}',
    )

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/papers/paper-a/summary")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_artifact"


def test_outline_returns_markdown_without_server_rendering(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")
    markdown = b"# Outline\n\n<script>alert('unsafe')</script>\n"
    _insert_artifact(data_dir, "paper-a", "outline_md", "outlines/a.md", markdown)

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/papers/paper-a/outline")

    assert response.status_code == 200
    assert response.json() == {"paper_id": "paper-a", "content": markdown.decode()}


def test_missing_artifact_returns_404(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/papers/paper-a/outline")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_query_validation_is_reported_by_fastapi(data_dir: Path) -> None:
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/papers", params={"limit": 0, "status": "unknown"})

    assert response.status_code == 422
