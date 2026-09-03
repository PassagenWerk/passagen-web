from pydantic import BaseModel, ConfigDict, Field


class ArtifactAvailability(BaseModel):
    summary: bool
    outline: bool
    pdf: bool


class PaperResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None
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
