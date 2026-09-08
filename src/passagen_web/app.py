import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from passagen.assistant import ConversationService
from passagen.assistant.errors import (
    AnswerValidationError,
    AssistantError,
    AssistantNotFoundError,
    CitationValidationError,
    ContextPlanError,
    InsufficientEvidenceError,
    ProviderCallError,
    ScopeError,
    StaleSourceError,
)
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
from passagen.generation import GenerationRunDispatcher
from passagen.processing import (
    ProcessingError,
    ProcessingService,
    RunConflictError,
    RunNotFoundError,
    UnknownPaperError,
)

from passagen_web import __version__
from passagen_web.api.collections import router as collections_router
from passagen_web.api.conversations import router as conversations_router
from passagen_web.api.generation_runs import router as generation_runs_router
from passagen_web.api.health import router as health_router
from passagen_web.api.papers import router as papers_router
from passagen_web.api.processing import router as processing_router
from passagen_web.api.qa_records import router as qa_records_router
from passagen_web.api.research import router as research_router
from passagen_web.api.tags import router as tags_router
from passagen_web.config import Settings
from passagen_web.runner import GenerationRunner, ProcessingRunner
from passagen_web.schemas.errors import ErrorDetail, ErrorResponse

logger = logging.getLogger("passagen_web.api")


def create_app(
    settings: Settings,
    *,
    static_dir: Path | None = None,
    assistant: ConversationService | None = None,
    dispatcher: GenerationRunDispatcher | None = None,
) -> FastAPI:
    processing = ProcessingService(settings.core)
    if dispatcher is None:
        dispatcher = GenerationRunDispatcher(
            settings.database_path,
            settings.data_dir,
            settings.core.providers.llm,
            settings.core.assistant,
            provider=assistant.provider if assistant is not None else None,
        )
    assistant = assistant or dispatcher.conversations

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        interrupted = processing.interrupt_active_runs()
        for run in interrupted:
            logger.info("processing_run_interrupted", extra={"run_id": run.id})
        interrupted_generation = dispatcher.interrupt_active_runs()
        if interrupted_generation:
            logger.info("generation_runs_interrupted", extra={"count": interrupted_generation})
        runner = ProcessingRunner(processing)
        generation_runner = GenerationRunner(dispatcher)
        runner.start()
        generation_runner.start()
        try:
            yield
        finally:
            runner.stop()
            generation_runner.stop()

    app = FastAPI(
        title="Passagen Web API",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.catalog = CatalogService(settings.database_path, settings.data_dir)
    app.state.processing = processing
    app.state.assistant = assistant
    app.state.dispatcher = dispatcher
    app.include_router(health_router, prefix="/api")
    app.include_router(papers_router, prefix="/api")
    app.include_router(tags_router, prefix="/api")
    app.include_router(collections_router, prefix="/api")
    app.include_router(processing_router, prefix="/api")
    app.include_router(conversations_router, prefix="/api")
    app.include_router(qa_records_router, prefix="/api")
    app.include_router(generation_runs_router, prefix="/api")
    app.include_router(research_router, prefix="/api")
    _install_error_handlers(app)
    _install_origin_protection(app, settings)
    _install_static_routes(app, static_dir or Path(__file__).with_name("static"))
    return app


def _install_origin_protection(app: FastAPI, settings: Settings) -> None:
    allowed = {settings.app_url, *settings.allowed_origins}

    @app.middleware("http")
    async def protect_local_writes(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        is_write = request.method in {"POST", "PUT", "PATCH", "DELETE"}
        origin = request.headers.get("origin", "").rstrip("/")
        if request.url.path.startswith("/api/") and is_write and origin and origin not in allowed:
            logger.warning(
                "write_rejected",
                extra={"method": request.method, "path": request.url.path},
            )
            error_response = ErrorResponse(
                error=ErrorDetail(
                    code="forbidden_origin",
                    message="The request origin is not allowed to modify this library",
                )
            )
            return JSONResponse(status_code=403, content=error_response.model_dump())
        response = await call_next(request)
        if request.url.path.startswith("/api/") and is_write:
            logger.info(
                "write_completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                },
            )
        return response


def _install_static_routes(app: FastAPI, static_dir: Path) -> None:
    index = static_dir / "index.html"
    assets = static_dir / "assets"
    if not index.is_file():
        return
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{frontend_path:path}", include_in_schema=False, response_class=FileResponse)
    def frontend(frontend_path: str) -> FileResponse:
        first_segment = frontend_path.partition("/")[0]
        if first_segment not in {"", "papers", "collections", "processing", "tags"}:
            raise HTTPException(status_code=404)
        return FileResponse(index, media_type="text/html", headers={"Cache-Control": "no-cache"})


def _install_error_handlers(app: FastAPI) -> None:
    errors: tuple[tuple[type[Exception], int, str], ...] = (
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
    processing_errors: tuple[tuple[type[Exception], int, str], ...] = (
        (UnknownPaperError, 404, "not_found"),
        (RunNotFoundError, 404, "not_found"),
        (RunConflictError, 409, "run_conflict"),
        (ProcessingError, 400, "invalid_request"),
    )
    for error_type, status_code, code in processing_errors:
        app.add_exception_handler(
            error_type,
            _error_handler(status_code, code),
        )
    assistant_errors: tuple[tuple[type[Exception], int, str], ...] = (
        (AssistantNotFoundError, 404, "not_found"),
        (ScopeError, 422, "invalid_scope"),
        (ContextPlanError, 422, "invalid_context_plan"),
        (CitationValidationError, 422, "invalid_citation"),
        (AnswerValidationError, 422, "invalid_answer"),
        (InsufficientEvidenceError, 422, "insufficient_evidence"),
        (StaleSourceError, 409, "stale_source"),
        (ProviderCallError, 502, "provider_error"),
        (AssistantError, 500, "assistant_error"),
    )
    for error_type, status_code, code in assistant_errors:
        app.add_exception_handler(
            error_type,
            _error_handler(status_code, code),
        )


def _error_handler(status_code: int, code: str):
    async def handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.warning("catalog_error", extra={"error_code": code})
        response = ErrorResponse(error=ErrorDetail(code=code, message=str(exc)))
        return JSONResponse(status_code=status_code, content=response.model_dump())

    return handler
