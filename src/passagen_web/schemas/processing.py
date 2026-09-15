"""Browser-facing schemas for processing runs and PDF imports."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

RunMode = Literal["continue", "rebuild"]
RebuildStage = Literal["metadata", "parse", "abstract", "summary", "outline"]


class ProcessingRunCreateRequest(BaseModel):
    paper_ids: list[str] = Field(min_length=1)
    mode: RunMode = "continue"
    from_stage: RebuildStage | None = None


class RunPaperFailureResponse(BaseModel):
    paper_id: str
    category: str
    message: str
    paper_exists: bool


class RunResultResponse(BaseModel):
    updated: list[str]
    skipped: list[str]
    failed: list[RunPaperFailureResponse]
    warnings: list[RunPaperFailureResponse]


class ProcessingRunResponse(BaseModel):
    id: str
    paper_ids: list[str]
    mode: RunMode
    from_stage: str | None
    status: str
    current_paper_id: str | None
    current_stage: str | None
    created_at: datetime
    finished_at: datetime | None
    error: str | None
    result: RunResultResponse | None


class ProcessingRunListResponse(BaseModel):
    items: list[ProcessingRunResponse]


class ProgressEventResponse(BaseModel):
    sequence: int
    run_id: str
    paper_id: str | None
    stage: str
    current: int
    total: int
    message: str


class ProgressEventListResponse(BaseModel):
    items: list[ProgressEventResponse]


class ImportFailureResponse(BaseModel):
    filename: str
    reason: str
    message: str


class ImportResponse(BaseModel):
    added: list[str]
    duplicates: list[str]
    failed: list[ImportFailureResponse]
