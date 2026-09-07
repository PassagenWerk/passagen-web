from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class ArtifactAvailability(BaseModel):
    summary: bool
    outline: bool
    pdf: bool


class PaperResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None
    abstract: str | None
    cleaned_abstract: str | None = None
    authors: list[str]
    year: int | None
    venue: str | None
    doi: str | None
    arxiv_id: str | None
    source_url: str | None
    original_filename: str
    status: str
    imported_at: str
    updated_at: str
    metadata_sources: dict[str, str]
    tag_ids: list[str]
    artifacts: ArtifactAvailability


class PaperPageResponse(BaseModel):
    items: list[PaperResponse]
    total: int
    limit: int
    offset: int


class SummaryResponse(BaseModel):
    paper_id: str
    content: dict[str, object]


class OutlineResponse(BaseModel):
    paper_id: str
    content: str = Field(description="Generated Markdown outline")


class NoteResponse(BaseModel):
    paper_id: str
    content: str = Field(description="User-authored Markdown note")


class PaperNoteUpdateRequest(BaseModel):
    content: Annotated[str, Field(max_length=1_000_000)]


class PaperMetadataUpdateRequest(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=1000)] | None = None
    venue: Annotated[str, Field(min_length=1, max_length=500)] | None = None
    year: Annotated[int, Field(ge=1, le=9999)] | None = None
    expected_updated_at: str


class PaperTagsUpdateRequest(BaseModel):
    tag_ids: list[str]
