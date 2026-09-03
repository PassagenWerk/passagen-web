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


def test_pdf_supports_inline_streaming_ranges_and_cache_validation(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")
    pdf = b"%PDF-1.7\n" + (b"paper data\n" * 200) + b"%%EOF\n"
    _insert_artifact(data_dir, "paper-a", "original_pdf", "objects/a.pdf", pdf)

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        full = client.get("/api/papers/paper-a/pdf")
        partial = client.get("/api/papers/paper-a/pdf", headers={"Range": "bytes=9-18"})
        head = client.head("/api/papers/paper-a/pdf")
        cached = client.get(
            "/api/papers/paper-a/pdf", headers={"If-None-Match": full.headers["etag"]}
        )

    assert full.status_code == 200
    assert full.content == pdf
    assert full.headers["content-type"] == "application/pdf"
    assert full.headers["content-disposition"] == 'inline; filename="a.pdf"'
    assert full.headers["accept-ranges"] == "bytes"
    assert full.headers["content-length"] == str(len(pdf))
    assert full.headers["cache-control"] == "private, no-cache"
    assert partial.status_code == 206
    assert partial.content == pdf[9:19]
    assert partial.headers["content-range"] == f"bytes 9-18/{len(pdf)}"
    assert head.status_code == 200
    assert head.content == b""
    assert head.headers["content-length"] == str(len(pdf))
    assert cached.status_code == 304
    assert cached.content == b""


def test_invalid_pdf_and_escaping_artifact_return_stable_errors(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")
    _insert_artifact(data_dir, "paper-a", "original_pdf", "objects/a.pdf", b"not a pdf")

    with connect_database(data_dir / "passagen.db") as connection:
        connection.execute(
            """
            INSERT INTO artifacts (id, paper_id, kind, path, size_bytes)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("zzz-paper-a-escape", "paper-a", "original_pdf", "../outside.pdf", 10),
        )

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        escaping = client.get("/api/papers/paper-a/pdf")

    assert escaping.status_code == 422
    assert escaping.json()["error"]["code"] == "invalid_artifact"

    with connect_database(data_dir / "passagen.db") as connection:
        connection.execute("DELETE FROM artifacts WHERE id = ?", ("zzz-paper-a-escape",))

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        invalid = client.get("/api/papers/paper-a/pdf")

    assert invalid.status_code == 422
    assert invalid.json()["error"] == {
        "code": "invalid_artifact",
        "message": "PDF artifact is not a complete PDF document",
    }


def test_query_validation_is_reported_by_fastapi(data_dir: Path) -> None:
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/papers", params={"limit": 0, "status": "unknown"})

    assert response.status_code == 422


def test_tags_are_available_for_library_filters(data_dir: Path) -> None:
    catalog = CatalogService(data_dir / "passagen.db", data_dir)
    tag = catalog.create_tag("Distributed systems", "#395b64")

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/tags")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": tag.id,
            "name": "Distributed systems",
            "color": "#395b64",
            "created_at": tag.created_at,
        }
    ]


def test_library_tag_lifecycle_and_paper_assignment(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        created = client.post("/api/tags", json={"name": "  Deep   Reading ", "color": "#395b64"})
        duplicate = client.post("/api/tags", json={"name": "deep reading"})
        tag_id = created.json()["id"]
        renamed = client.patch(f"/api/tags/{tag_id}", json={"name": "Important"})
        assigned = client.put("/api/papers/paper-a/tags", json={"tag_ids": [tag_id]})
        deleted = client.delete(f"/api/tags/{tag_id}")
        detail = client.get("/api/papers/paper-a")

    assert created.status_code == 201
    assert created.json()["name"] == "Deep Reading"
    assert duplicate.status_code == 409
    assert renamed.json()["name"] == "Important"
    assert renamed.json()["color"] == "#395b64"
    assert assigned.json()["tag_ids"] == [tag_id]
    assert deleted.status_code == 204
    assert detail.json()["tag_ids"] == []


def test_user_metadata_update_uses_optimistic_concurrency(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        original = client.get("/api/papers/paper-a").json()
        updated = client.patch(
            "/api/papers/paper-a/metadata",
            json={
                "title": "User title",
                "venue": "OSDI",
                "year": 2025,
                "expected_updated_at": original["updated_at"],
            },
        )
        stale = client.patch(
            "/api/papers/paper-a/metadata",
            json={
                "title": "Stale title",
                "expected_updated_at": original["updated_at"],
            },
        )

    assert updated.status_code == 200
    assert updated.json()["title"] == "User title"
    assert updated.json()["metadata_sources"] == {
        "title": "user",
        "venue": "user",
        "year": "user",
    }
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "conflict"


def test_tag_and_metadata_payloads_are_validated(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", title="Alpha", year=2024, venue="SOSP")

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        color = client.post("/api/tags", json={"name": "Reading", "color": "red"})
        empty_patch = client.patch("/api/tags/missing", json={})
        invalid_year = client.patch(
            "/api/papers/paper-a/metadata",
            json={"year": 10000, "expected_updated_at": "stale"},
        )

    assert color.status_code == 422
    assert empty_patch.status_code == 422
    assert invalid_year.status_code == 422
