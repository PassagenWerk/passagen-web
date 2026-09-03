from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from passagen.catalog import (
    CatalogBusyError,
    CatalogConflictError,
    CatalogError,
    CatalogNotFoundError,
    CatalogService,
    CatalogValidationError,
    IncompatibleSchemaError,
    InvalidArtifactError,
)

from passagen_web import __version__
from passagen_web.api.health import router as health_router
from passagen_web.api.papers import router as papers_router
from passagen_web.config import Settings
from passagen_web.schemas.errors import ErrorDetail, ErrorResponse


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(
        title="Passagen Web API",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.catalog = CatalogService(settings.database_path, settings.data_dir)
    app.include_router(health_router, prefix="/api")
    app.include_router(papers_router, prefix="/api")
    _install_error_handlers(app)
    return app


def _install_error_handlers(app: FastAPI) -> None:
    errors: tuple[tuple[type[CatalogError], int, str], ...] = (
        (CatalogNotFoundError, 404, "not_found"),
        (InvalidArtifactError, 422, "invalid_artifact"),
        (CatalogValidationError, 400, "invalid_request"),
        (CatalogConflictError, 409, "conflict"),
        (CatalogBusyError, 503, "database_busy"),
        (IncompatibleSchemaError, 503, "incompatible_schema"),
        (CatalogError, 500, "catalog_error"),
    )
    for error_type, status_code, code in errors:
        app.add_exception_handler(
            error_type,
            _error_handler(status_code, code),
        )


def _error_handler(status_code: int, code: str):
    async def handler(_request: Request, exc: Exception) -> JSONResponse:
        response = ErrorResponse(error=ErrorDetail(code=code, message=str(exc)))
        return JSONResponse(status_code=status_code, content=response.model_dump())

    return handler
