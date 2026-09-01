from fastapi import APIRouter

from passagen_web.dependencies import SettingsDependency
from passagen_web.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(settings: SettingsDependency) -> HealthResponse:
    # Startup validates the library; this catches removal while the server is running.
    if not settings.database_path.is_file():
        raise RuntimeError("Passagen database is no longer available")
    return HealthResponse()
