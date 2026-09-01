from fastapi import FastAPI

from passagen_web import __version__
from passagen_web.api.health import router as health_router
from passagen_web.config import Settings


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(
        title="Passagen Web API",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.include_router(health_router, prefix="/api")
    return app
