"""Browser-facing schemas for archived QA records and generation runs."""

from pydantic import BaseModel


class QaRecordSummaryResponse(BaseModel):
    id: str
    conversation_id: str
    paper_id: str | None
    standalone_question: str
    answer_markdown: str
    intent: str
    archived_at: str | None
    archive_title: str | None
    archive_tags: list[str]
    citation_count: int
    created_at: str


class QaRecordListResponse(BaseModel):
    items: list[QaRecordSummaryResponse]


class QaRecordArchiveRequest(BaseModel):
    archived: bool
    title: str | None = None
    tags: list[str] | None = None


class GenerationLlmCallResponse(BaseModel):
    stage: str
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    finish_reason: str | None
    error_message: str | None


class GenerationRunResponse(BaseModel):
    id: str
    kind: str
    status: str
    error_code: str | None
    error_message: str | None
    created_at: str
    started_at: str | None
    completed_at: str | None
    llm_calls: list[GenerationLlmCallResponse]
    input_tokens: int
    output_tokens: int
