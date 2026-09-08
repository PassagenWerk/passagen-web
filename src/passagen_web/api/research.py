"""Collection synthesis, report, and run-history API adapters.

Long tasks are queued as persisted generation runs and executed by the
background dispatcher; the API only translates between HTTP and the Core
research services. Fingerprints and stale/reuse semantics stay in Core.
"""

from fastapi import APIRouter, Response
from passagen.assistant.errors import AssistantNotFoundError
from passagen.research import (
    CollectionReportView,
    CollectionSynthesisResult,
)

from passagen_web.dependencies import DispatcherDependency
from passagen_web.schemas.research import (
    CollectionRunListResponse,
    CollectionRunResponse,
    ReportListResponse,
    ReportSubmissionResponse,
    ReportSubmitRequest,
    SynthesisSubmissionResponse,
    SynthesisSubmitRequest,
)

router = APIRouter(prefix="/collections/{collection_id}", tags=["collection-research"])


@router.get("/synthesis", response_model=CollectionSynthesisResult)
def get_synthesis(
    collection_id: str, dispatcher: DispatcherDependency
) -> CollectionSynthesisResult:
    result = dispatcher.syntheses.latest(collection_id)
    if result is None:
        raise AssistantNotFoundError(f"No synthesis for collection: {collection_id}")
    return result


@router.post("/synthesis", response_model=SynthesisSubmissionResponse)
def submit_synthesis(
    collection_id: str,
    payload: SynthesisSubmitRequest,
    dispatcher: DispatcherDependency,
    response: Response,
) -> SynthesisSubmissionResponse:
    submission = dispatcher.syntheses.submit_synthesis(
        collection_id, allow_partial=payload.allow_partial, force=payload.force
    )
    if submission.result is not None:
        return SynthesisSubmissionResponse(result=submission.result)
    response.status_code = 202
    return SynthesisSubmissionResponse(run_id=submission.run_id)


@router.post("/reports", response_model=ReportSubmissionResponse)
def submit_report(
    collection_id: str,
    payload: ReportSubmitRequest,
    dispatcher: DispatcherDependency,
    response: Response,
) -> ReportSubmissionResponse:
    submission = dispatcher.reports.submit_report(
        collection_id,
        payload.kind,
        user_prompt=payload.user_prompt,
        allow_partial=payload.allow_partial,
        force=payload.force,
    )
    if submission.result is not None:
        return ReportSubmissionResponse(report_id=submission.report_id, result=submission.result)
    response.status_code = 202
    return ReportSubmissionResponse(report_id=submission.report_id, run_id=submission.run_id)


@router.get("/reports", response_model=ReportListResponse)
def list_reports(collection_id: str, dispatcher: DispatcherDependency) -> ReportListResponse:
    return ReportListResponse(items=list(dispatcher.reports.list_reports(collection_id)))


@router.get("/reports/{report_id}", response_model=CollectionReportView)
def get_report(
    collection_id: str, report_id: str, dispatcher: DispatcherDependency
) -> CollectionReportView:
    view = dispatcher.reports.get_report(report_id)
    if view.record.collection_id != collection_id:
        raise AssistantNotFoundError(f"Collection report not found: {report_id}")
    return view


@router.get("/runs", response_model=CollectionRunListResponse)
def list_collection_runs(
    collection_id: str, dispatcher: DispatcherDependency
) -> CollectionRunListResponse:
    """Persistent run state for synthesis and report generation on this collection."""

    run_ids: dict[str, str | None] = {}  # run_id -> report_id
    latest = dispatcher.syntheses.latest(collection_id)
    if latest is not None and latest.run_id is not None:
        run_ids.setdefault(latest.run_id, None)
    for view in dispatcher.reports.list_reports(collection_id):
        if view.record.run_id is not None:
            run_ids.setdefault(view.record.run_id, view.record.id)
    items: list[CollectionRunResponse] = []
    for run_id, report_id in run_ids.items():
        run = dispatcher.conversations.find_generation_run(run_id)
        if run is None:
            continue
        items.append(
            CollectionRunResponse(
                id=run.id,
                kind=run.kind,
                status=run.status,
                report_id=report_id,
                error_code=run.error_code,
                error_message=run.error_message,
                created_at=run.created_at,
                started_at=run.started_at,
                completed_at=run.completed_at,
            )
        )
    items.sort(key=lambda item: item.created_at, reverse=True)
    return CollectionRunListResponse(items=items)
