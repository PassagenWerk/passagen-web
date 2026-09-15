from typing import Annotated, Literal

from fastapi import APIRouter, Query
from passagen.processing import ProcessingRun, ProgressEvent
from passagen.storage.repository import get_paper

from passagen_web.config import Settings
from passagen_web.dependencies import ProcessingDependency, SettingsDependency
from passagen_web.schemas.processing import (
    ProcessingRunCreateRequest,
    ProcessingRunListResponse,
    ProcessingRunResponse,
    ProgressEventListResponse,
    ProgressEventResponse,
    RunPaperFailureResponse,
    RunResultResponse,
)

router = APIRouter(prefix="/processing-runs", tags=["processing"])


@router.post("", status_code=202, response_model=ProcessingRunResponse)
def create_processing_run(
    payload: ProcessingRunCreateRequest,
    processing: ProcessingDependency,
    settings: SettingsDependency,
) -> ProcessingRunResponse:
    run = processing.start_update(
        payload.paper_ids, mode=payload.mode, from_stage=payload.from_stage
    )
    return _run_response(run, settings)


@router.get("", response_model=ProcessingRunListResponse)
def list_processing_runs(
    processing: ProcessingDependency,
    settings: SettingsDependency,
    status: Annotated[
        Literal["queued", "running", "completed", "failed", "interrupted"] | None, Query()
    ] = None,
    paper_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ProcessingRunListResponse:
    runs = processing.list_runs(status=status, paper_id=paper_id, limit=limit)
    paper_exists: dict[str, bool] = {}
    return ProcessingRunListResponse(
        items=[_run_response(run, settings, paper_exists) for run in runs]
    )


@router.get("/{run_id}", response_model=ProcessingRunResponse)
def get_processing_run(
    run_id: str, processing: ProcessingDependency, settings: SettingsDependency
) -> ProcessingRunResponse:
    return _run_response(processing.get_run(run_id), settings)


@router.get("/{run_id}/events", response_model=ProgressEventListResponse)
def list_processing_run_events(
    run_id: str,
    processing: ProcessingDependency,
    settings: SettingsDependency,
    after: Annotated[int, Query(ge=0)] = 0,
) -> ProgressEventListResponse:
    events = processing.list_events(run_id, after=after)
    return ProgressEventListResponse(items=[_event_response(event, settings) for event in events])


def _sanitize(message: str, settings: Settings) -> str:
    """Keep storage internals (absolute artifact paths) out of browser responses."""
    return message.replace(str(settings.data_dir), "<data-dir>")


def _failure_response(
    paper_id: str,
    category: str,
    message: str,
    settings: Settings,
    paper_exists: dict[str, bool],
) -> RunPaperFailureResponse:
    if paper_id not in paper_exists:
        paper_exists[paper_id] = get_paper(settings.database_path, paper_id) is not None
    return RunPaperFailureResponse(
        paper_id=paper_id,
        category=category,
        message=_sanitize(message, settings),
        paper_exists=paper_exists[paper_id],
    )


def _run_response(
    run: ProcessingRun,
    settings: Settings,
    paper_exists: dict[str, bool] | None = None,
) -> ProcessingRunResponse:
    existence_cache = paper_exists if paper_exists is not None else {}
    result = run.result
    return ProcessingRunResponse(
        id=run.id,
        paper_ids=run.paper_ids,
        mode=run.mode,
        from_stage=run.from_stage,
        status=run.status.value,
        current_paper_id=run.current_paper_id,
        current_stage=run.current_stage,
        created_at=run.created_at,
        finished_at=run.finished_at,
        error=_sanitize(run.error, settings) if run.error else None,
        result=(
            RunResultResponse(
                updated=result.updated,
                skipped=result.skipped,
                failed=[
                    _failure_response(
                        failure.paper_id,
                        failure.category,
                        failure.message,
                        settings,
                        existence_cache,
                    )
                    for failure in result.failed
                ],
                warnings=[
                    _failure_response(
                        warning.paper_id,
                        warning.category,
                        warning.message,
                        settings,
                        existence_cache,
                    )
                    for warning in result.warnings
                ],
            )
            if result is not None
            else None
        ),
    )


def _event_response(event: ProgressEvent, settings: Settings) -> ProgressEventResponse:
    return ProgressEventResponse(
        sequence=event.sequence,
        run_id=event.run_id,
        paper_id=event.paper_id,
        stage=event.stage,
        current=event.current,
        total=event.total,
        message=_sanitize(event.message, settings),
    )
