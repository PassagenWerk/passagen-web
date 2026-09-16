import json
from pathlib import Path

from fastapi.testclient import TestClient
from passagen.catalog import CatalogService
from passagen.storage.database import connect_database

from passagen_web.app import create_app
from passagen_web.config import Settings


def _insert_paper(data_dir: Path, paper_id: str, title: str) -> None:
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
                2026,
                "SOSP",
                f"{paper_id}.pdf",
                paper_id.ljust(64, "0"),
                "summarized",
            ),
        )


def test_collection_lifecycle_membership_and_atomic_order(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", "Alpha")
    _insert_paper(data_dir, "paper-b", "Beta")

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        created = client.post(
            "/api/collections",
            json={"name": "Reading queue", "description": "Start here"},
        )
        collection_id = created.json()["id"]
        added = client.post(
            f"/api/collections/{collection_id}/papers",
            json={"paper_ids": ["paper-a", "paper-b"]},
        )
        duplicate = client.post(
            f"/api/collections/{collection_id}/papers",
            json={"paper_ids": ["paper-a"]},
        )
        reordered = client.patch(
            f"/api/collections/{collection_id}/papers/order",
            json={"paper_ids": ["paper-b", "paper-a"]},
        )
        invalid_order = client.patch(
            f"/api/collections/{collection_id}/papers/order",
            json={"paper_ids": ["paper-a"]},
        )
        renamed = client.patch(
            f"/api/collections/{collection_id}",
            json={"name": "Core reading", "description": None},
        )
        listed = client.get("/api/collections")
        removed = client.delete(f"/api/collections/{collection_id}/papers/paper-b")
        paper = client.get("/api/papers/paper-b")
        deleted = client.delete(f"/api/collections/{collection_id}")

    assert created.status_code == 201
    assert added.status_code == 200
    assert [item["paper"]["id"] for item in added.json()["papers"]] == [
        "paper-a",
        "paper-b",
    ]
    assert len(duplicate.json()["papers"]) == 2
    assert [item["position"] for item in reordered.json()["papers"]] == [0, 1]
    assert reordered.json()["papers"][0]["paper"]["id"] == "paper-b"
    assert invalid_order.status_code == 400
    assert renamed.json()["name"] == "Core reading"
    assert renamed.json()["description"] is None
    assert listed.json()[0]["paper_count"] == 2
    assert [item["paper"]["id"] for item in removed.json()["papers"]] == ["paper-a"]
    assert paper.status_code == 200
    assert deleted.status_code == 204


def test_library_can_browse_collection_and_unfiled_papers(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", "Alpha")
    _insert_paper(data_dir, "paper-b", "Beta")

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        collection = client.post("/api/collections", json={"name": "Reading"}).json()
        client.post(
            f"/api/collections/{collection['id']}/papers",
            json={"paper_ids": ["paper-a"]},
        )
        filed = client.get("/api/papers", params={"collection": collection["id"]})
        collection_order = client.get(
            "/api/papers",
            params={
                "collection": collection["id"],
                "sort": "collection_order",
                "direction": "asc",
            },
        )
        unfiled = client.get("/api/papers", params={"unfiled": "true"})
        all_papers = client.get("/api/papers")

    assert [paper["id"] for paper in filed.json()["items"]] == ["paper-a"]
    assert [paper["id"] for paper in collection_order.json()["items"]] == ["paper-a"]
    assert [paper["id"] for paper in unfiled.json()["items"]] == ["paper-b"]
    assert all_papers.json()["total"] == 2


def test_collection_payload_and_domain_errors_are_stable(data_dir: Path) -> None:
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        blank = client.post("/api/collections", json={"name": " "})
        empty_patch = client.patch("/api/collections/missing", json={})
        missing = client.get("/api/collections/missing")

    assert blank.status_code == 400
    assert blank.json()["error"]["code"] == "invalid_request"
    assert empty_patch.status_code == 422
    assert missing.status_code == 404


def test_collection_markdown_documents_can_be_read_edited_and_deleted(data_dir: Path) -> None:
    _insert_paper(data_dir, "paper-a", "Alpha")
    _insert_paper(data_dir, "paper-b", "Beta")
    catalog = CatalogService(data_dir / "passagen.db", data_dir)
    collection = catalog.create_collection("External research")
    catalog.add_collection_papers(collection.id, ["paper-a"])
    document = catalog.create_collection_document(
        collection.id,
        title="Imported brief",
        content_markdown="# Brief\n\nInitial content.",
        source="mcp",
        external_id="brief-1",
    )
    catalog.remove_collection_paper(collection.id, "paper-a")
    catalog.add_collection_papers(collection.id, ["paper-b"])

    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        listed = client.get(f"/api/collections/{collection.id}/documents")
        web_created = client.post(
            f"/api/collections/{collection.id}/documents",
            json={"title": "Web note", "content_markdown": "# Draft"},
        )
        detail = client.get(f"/api/collections/{collection.id}/documents/{document.id}")
        updated = client.patch(
            f"/api/collections/{collection.id}/documents/{document.id}",
            json={
                "title": "Reviewed brief",
                "content_markdown": "# Brief\n\nEdited content.",
                "expected_revision": 1,
            },
        )
        stale = client.patch(
            f"/api/collections/{collection.id}/documents/{document.id}",
            json={"content_markdown": "Stale edit", "expected_revision": 1},
        )
        deleted = client.delete(f"/api/collections/{collection.id}/documents/{document.id}")
        missing = client.get(f"/api/collections/{collection.id}/documents/{document.id}")

    assert listed.status_code == 200
    assert listed.json()[0]["id"] == document.id
    assert listed.json()[0]["title"] == "Imported brief"
    assert listed.json()[0]["papers"] == [{"id": "paper-a", "title": "Alpha"}]
    assert listed.json()[0]["paper_changes"]["added"] == [{"id": "paper-b", "title": "Beta"}]
    assert listed.json()[0]["paper_changes"]["removed"] == [{"id": "paper-a", "title": "Alpha"}]
    assert "content_markdown" not in listed.json()[0]
    assert web_created.status_code == 201
    assert web_created.json()["source"] == "web"
    assert web_created.json()["papers"] == [{"id": "paper-b", "title": "Beta"}]
    assert detail.json()["content_markdown"] == "# Brief\n\nInitial content."
    assert updated.json()["title"] == "Reviewed brief"
    assert updated.json()["revision"] == 2
    assert stale.status_code == 409
    assert deleted.status_code == 204
    assert missing.status_code == 404
