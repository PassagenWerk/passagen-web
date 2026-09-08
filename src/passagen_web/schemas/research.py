"""Browser-facing schemas for collection synthesis, reports, and run history."""

from passagen.research import (
    CollectionReportResult,
    CollectionReportView,
    CollectionSynthesisResult,
    ReportKind,
)
from pydantic import BaseModel


class SynthesisSubmitRequest(BaseModel):
    allow_partial: bool = False
    force: bool = False


class SynthesisSubmissionResponse(BaseModel):
    """202 when a run was queued, 200 with a result when a fresh synthesis was reused."""

    run_id: str | None = None
    result: CollectionSynthesisResult | None = None


class ReportSubmitRequest(BaseModel):
    kind: ReportKind
    user_prompt: str | None = None
    allow_partial: bool = False
    force: bool = False


class ReportSubmissionResponse(BaseModel):
    """202 when a run was queued, 200 with a result when a fresh report was reused."""

    report_id: str | None = None
    run_id: str | None = None
    result: CollectionReportResult | None = None


class ReportListResponse(BaseModel):
    items: list[CollectionReportView]


class CollectionRunResponse(BaseModel):
    """Lightweight generation run entry for the collection run history."""

    id: str
    kind: str
    status: str
    report_id: str | None = None
    error_code: str | None
    error_message: str | None
    created_at: str
    started_at: str | None
    completed_at: str | None


class CollectionRunListResponse(BaseModel):
    items: list[CollectionRunResponse]
