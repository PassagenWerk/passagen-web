from typing import Annotated

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import FileResponse
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
    PaperMetadataUpdateRequest,
    PaperPageResponse,
    PaperResponse,
    PaperTagsUpdateRequest,
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
    unfiled: bool = False,
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
            unfiled=unfiled,
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


@router.patch("/{paper_id}/metadata", response_model=PaperResponse)
def update_paper_metadata(
    paper_id: str, payload: PaperMetadataUpdateRequest, catalog: CatalogDependency
) -> PaperResponse:
    return _paper_response(
        catalog.update_user_metadata(
            paper_id,
            title=payload.title,
            venue=payload.venue,
            year=payload.year,
            expected_updated_at=payload.expected_updated_at,
        )
    )


@router.put("/{paper_id}/tags", response_model=PaperResponse)
def update_paper_tags(
    paper_id: str, payload: PaperTagsUpdateRequest, catalog: CatalogDependency
) -> PaperResponse:
    catalog.set_paper_tags(paper_id, payload.tag_ids)
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


@router.get("/{paper_id}/pdf", response_class=FileResponse)
@router.head("/{paper_id}/pdf", include_in_schema=False)
def get_pdf(paper_id: str, request: Request, catalog: CatalogDependency) -> Response:
    path = catalog.resolve_artifact(paper_id, "original_pdf")
    try:
        stat_result = path.stat()
        with path.open("rb") as artifact:
            header = artifact.read(min(1024, stat_result.st_size))
            artifact.seek(max(0, stat_result.st_size - 1024))
            trailer = artifact.read(1024)
    except OSError as exc:
        raise InvalidArtifactError("PDF artifact could not be read") from exc
    if b"%PDF-" not in header or b"%%EOF" not in trailer:
        raise InvalidArtifactError("PDF artifact is not a complete PDF document")

    response = FileResponse(
        path,
        media_type="application/pdf",
        filename=path.name,
        content_disposition_type="inline",
        stat_result=stat_result,
        headers={"Cache-Control": "private, no-cache"},
    )
    etag = response.headers["etag"]
    candidates = {
        candidate.strip().removeprefix("W/")
        for candidate in request.headers.get("if-none-match", "").split(",")
    }
    if "*" in candidates or etag in candidates:
        return Response(
            status_code=304,
            headers={
                "Cache-Control": response.headers["cache-control"],
                "ETag": etag,
                "Last-Modified": response.headers["last-modified"],
            },
        )
    return response


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
