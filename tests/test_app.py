from pathlib import Path

from fastapi.testclient import TestClient
from passagen.catalog import CatalogService

from passagen_web.app import create_app
from passagen_web.config import Settings


def test_health_reports_available_database(data_dir: Path) -> None:
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "available"}


def test_openapi_is_rooted_under_api(data_dir: Path) -> None:
    with TestClient(create_app(Settings.from_data_dir(data_dir))) as client:
        response = client.get("/api/openapi.json")

    assert response.status_code == 200
    assert "/api/health" in response.json()["paths"]
    assert "/api/papers" in response.json()["paths"]
    assert "/api/papers/{paper_id}/pdf" in response.json()["paths"]
    assert "/api/papers/{paper_id}/metadata" in response.json()["paths"]
    assert "/api/papers/{paper_id}/tags" in response.json()["paths"]
    assert "/api/tags/{tag_id}" in response.json()["paths"]


def test_production_app_serves_assets_and_spa_fallback_without_masking_api(
    data_dir: Path, tmp_path: Path
) -> None:
    static = tmp_path / "static"
    assets = static / "assets"
    assets.mkdir(parents=True)
    (static / "index.html").write_text("<main>Passagen application</main>")
    (assets / "app.js").write_text("console.log('passagen')")

    with TestClient(create_app(Settings.from_data_dir(data_dir), static_dir=static)) as client:
        root = client.get("/")
        paper_route = client.get("/papers/paper-1/pdf?page=3")
        collection_route = client.get("/collections/collection-1/papers/paper-1")
        tag_route = client.get("/tags/tag-1")
        asset = client.get("/assets/app.js")
        missing_api = client.get("/api/not-a-route")
        missing_frontend = client.get("/not-a-route")

    assert root.text == "<main>Passagen application</main>"
    assert paper_route.status_code == 200
    assert collection_route.status_code == 200
    assert tag_route.status_code == 200
    assert asset.text == "console.log('passagen')"
    assert missing_api.status_code == 404
    assert missing_api.headers["content-type"].startswith("application/json")
    assert missing_frontend.status_code == 404


def test_browser_origins_cannot_modify_the_local_library(data_dir: Path) -> None:
    settings = Settings.from_data_dir(
        data_dir,
        allowed_origins=("http://127.0.0.1:5173",),
    )

    with TestClient(create_app(settings)) as client:
        blocked = client.post(
            "/api/tags",
            json={"name": "Blocked"},
            headers={"Origin": "https://malicious.example"},
        )
        same_origin = client.post(
            "/api/tags",
            json={"name": "Same origin"},
            headers={"Origin": settings.app_url},
        )
        development_origin = client.post(
            "/api/tags",
            json={"name": "Development"},
            headers={"Origin": "http://127.0.0.1:5173"},
        )
        local_client = client.post("/api/tags", json={"name": "Local client"})

    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "forbidden_origin"
    assert same_origin.status_code == 201
    assert development_origin.status_code == 201
    assert local_client.status_code == 201
    assert {tag.name for tag in CatalogService(settings.database_path, data_dir).list_tags()} == {
        "Development",
        "Local client",
        "Same origin",
    }
