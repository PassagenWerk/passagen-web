from pathlib import Path

from fastapi.testclient import TestClient

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
