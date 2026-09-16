from typing import Annotated, Self

from pydantic import BaseModel, Field, model_validator

from passagen_web.schemas.papers import PaperResponse


class CollectionSummaryResponse(BaseModel):
    id: str
    name: str
    description: str | None
    created_at: str
    updated_at: str
    paper_count: int


class CollectionMemberResponse(BaseModel):
    paper: PaperResponse
    position: int
    note: str | None
    added_at: str


class CollectionResponse(CollectionSummaryResponse):
    papers: list[CollectionMemberResponse]


class CollectionCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    description: Annotated[str, Field(max_length=4000)] | None = None


class CollectionUpdateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    description: Annotated[str, Field(max_length=4000)] | None = None

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one collection field is required")
        return self


class CollectionPapersRequest(BaseModel):
    paper_ids: Annotated[list[str], Field(min_length=1)]


class CollectionOrderRequest(BaseModel):
    paper_ids: list[str]


class CollectionDocumentPaperResponse(BaseModel):
    id: str
    title: str | None


class CollectionDocumentPaperChangesResponse(BaseModel):
    added: list[CollectionDocumentPaperResponse]
    removed: list[CollectionDocumentPaperResponse]
    order_changed: bool


class CollectionDocumentSummaryResponse(BaseModel):
    id: str
    collection_id: str
    title: str
    document_type: str
    kind: str
    status: str
    editable: bool
    source: str
    external_id: str | None
    revision: int | None
    papers: list[CollectionDocumentPaperResponse]
    paper_changes: CollectionDocumentPaperChangesResponse
    created_at: str
    updated_at: str


class CollectionDocumentResponse(CollectionDocumentSummaryResponse):
    content_markdown: str | None


class CollectionDocumentCreateRequest(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    content_markdown: Annotated[str, Field(max_length=1_000_000)] = ""


class CollectionDocumentUpdateRequest(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    content_markdown: Annotated[str, Field(max_length=1_000_000)] | None = None
    expected_revision: Annotated[int, Field(ge=1)]

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not ({"title", "content_markdown"} & self.model_fields_set):
            raise ValueError("at least one document field is required")
        return self
