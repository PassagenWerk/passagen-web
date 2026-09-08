"""Browser-facing schemas for conversations and answer turns."""

from pydantic import BaseModel, Field


class ConversationCreateRequest(BaseModel):
    paper_id: str
    title: str | None = None


class ConversationRenameRequest(BaseModel):
    title: str = Field(min_length=1)


class ConversationResponse(BaseModel):
    id: str
    paper_id: str
    title: str
    created_at: str
    updated_at: str


class ConversationListResponse(BaseModel):
    items: list[ConversationResponse]


class CitationResponse(BaseModel):
    citation_id: str
    artifact_kind: str
    summary_path: str | None
    section: str | None
    page_start: int | None
    page_end: int | None
    excerpt: str | None


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    status: str
    run_id: str | None
    created_at: str
    qa_record_id: str | None = None
    sources: list[str] | None = None
    archived: bool = False
    citations: list[CitationResponse] | None = None
    error_code: str | None = None
    error_message: str | None = None
    llm_call_count: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    disposition: str | None = None
    reused_from_qa_id: str | None = None
    stale: bool = False
    stale_reasons: list[str] = Field(default_factory=list)


class ConversationDetailResponse(BaseModel):
    conversation: ConversationResponse
    messages: list[MessageResponse]


class TurnCreateRequest(BaseModel):
    question: str = Field(min_length=1)
    force_regenerate: bool = False


class RunStatusResponse(BaseModel):
    id: str
    status: str
    error_code: str | None
    error_message: str | None
    llm_call_count: int
    input_tokens: int
    output_tokens: int


class TurnResponse(BaseModel):
    message: MessageResponse
    run: RunStatusResponse | None
