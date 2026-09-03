from typing import Annotated

from fastapi import APIRouter, Query
from passagen.catalog import (
    InvalidArtifactError,
    PaperFilters,
    PaperSort,
    PaperStatus,
    PaperView,
    SortDirection,
    validate_summary_json,
)

from passagen_web.dependencies import CatalogDependency
from passagen_web.schemas.papers import (
    ArtifactAvailability,
    OutlineResponse,
    PaperPageResponse,
    PaperResponse,
    SummaryResponse,
)

router = APIRouter(prefix="/papers", tags=["papers"])


@router.get("", response_model=PaperPageResponse)
def list_papers(
    catalog: CatalogDependency,
    query: Annotated[str | None, Query(alias="q")] = None,
    status: PaperStatus | None = None,
    tag: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    collection: str | None = None,
    sort: PaperSort = PaperSort.IMPORTED_AT,
    direction: SortDirection = SortDirection.DESC,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaperPageResponse:
    page = catalog.list_papers(
        PaperFilters(
            query=query,
            status=status,
            tag_id=tag,
            venue=venue,
            year=year,
            collection_id=collection,
        ),
        sort=sort,
        direction=direction,
        limit=limit,
        offset=offset,
    )
    return PaperPageResponse(
        items=[_paper_response(paper) for paper in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/{paper_id}", response_model=PaperResponse)
def get_paper(paper_id: str, catalog: CatalogDependency) -> PaperResponse:
    return _paper_response(catalog.get_paper(paper_id))


@router.get("/{paper_id}/summary", response_model=SummaryResponse)
def get_summary(paper_id: str, catalog: CatalogDependency) -> SummaryResponse:
    path = catalog.resolve_artifact(paper_id, "summary_json")
    try:
        content = path.read_bytes()
    except OSError as exc:
        raise InvalidArtifactError("Summary artifact could not be read") from exc
    return SummaryResponse(paper_id=paper_id, content=validate_summary_json(content))


@router.get("/{paper_id}/outline", response_model=OutlineResponse)
def get_outline(paper_id: str, catalog: CatalogDependency) -> OutlineResponse:
    path = catalog.resolve_artifact(paper_id, "outline_md")
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise InvalidArtifactError("Outline artifact is not readable UTF-8 text") from exc
    return OutlineResponse(paper_id=paper_id, content=content)


def _paper_response(paper: PaperView) -> PaperResponse:
    kinds = set(paper.artifact_kinds)
    return PaperResponse(
        id=paper.id,
        title=paper.title,
        authors=list(paper.authors),
        year=paper.year,
        venue=paper.venue,
        doi=paper.doi,
        arxiv_id=paper.arxiv_id,
        source_url=paper.source_url,
        original_filename=paper.original_filename,
        status=paper.status.value,
        imported_at=paper.imported_at,
        updated_at=paper.updated_at,
        metadata_sources=paper.metadata_sources,
        tag_ids=list(paper.tag_ids),
        artifacts=ArtifactAvailability(
            summary="summary_json" in kinds,
            outline="outline_md" in kinds,
            pdf="original_pdf" in kinds,
        ),
    )
