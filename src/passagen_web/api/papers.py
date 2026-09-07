import logging
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from passagen.catalog import (
    InvalidArtifactError,
    PaperFilters,
    PaperSort,
    PaperStatus,
    PaperView,
    SortDirection,
    TagMatch,
    validate_summary_json,
)
from passagen.stages.abstract_fixing import load_cleaned_abstract
from passagen.stages.scanning import import_files

from passagen_web.dependencies import CatalogDependency, SettingsDependency
from passagen_web.schemas.papers import (
    ArtifactAvailability,
    NoteResponse,
    OutlineResponse,
    PaperMetadataUpdateRequest,
    PaperNoteUpdateRequest,
    PaperPageResponse,
    PaperResponse,
    PaperTagsUpdateRequest,
    SummaryResponse,
)
from passagen_web.schemas.processing import ImportFailureResponse, ImportResponse

logger = logging.getLogger("passagen_web.api")

router = APIRouter(prefix="/papers", tags=["papers"])


@router.post("/import", response_model=ImportResponse)
async def import_papers(
    settings: SettingsDependency,
    files: list[UploadFile],
) -> ImportResponse:
    """Import uploaded PDF files; processing is triggered separately."""
    staging_root = settings.data_dir / "pdfs" / ".tmp" / f"upload-{uuid.uuid4()}"
    staged: list[Path] = []
    try:
        for index, upload in enumerate(files):
            filename = Path(upload.filename or "upload.pdf").name
            staged_path = staging_root / str(index) / filename
            staged_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with staged_path.open("wb") as target:
                    while chunk := await upload.read(1024 * 1024):
                        target.write(chunk)
            finally:
                await upload.close()
            staged.append(staged_path)
        result = import_files(
            staged,
            data_dir=settings.data_dir,
            database_path=settings.database_path,
        )
    finally:
        for staged_path in staged:
            staged_path.unlink(missing_ok=True)
            staged_path.parent.rmdir()
        if staging_root.is_dir():
            staging_root.rmdir()
    return ImportResponse(
        added=[paper.id for paper in result.imported],
        duplicates=[paper.id for paper in result.skipped],
        failed=[
            ImportFailureResponse(
                filename=failure.path.name,
                reason=failure.code,
                message=failure.message.replace(str(settings.data_dir), "<data-dir>"),
            )
            for failure in result.failures
        ],
    )


@router.get("", response_model=PaperPageResponse)
def list_papers(
    catalog: CatalogDependency,
    query: Annotated[str | None, Query(alias="q")] = None,
    status: PaperStatus | None = None,
    tag: Annotated[list[str] | None, Query()] = None,
    tag_match: TagMatch = TagMatch.ALL,
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
            tag_ids=tuple(dict.fromkeys(tag or [])),
            tag_match=tag_match,
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
def get_paper(
    paper_id: str,
    catalog: CatalogDependency,
    settings: SettingsDependency,
) -> PaperResponse:
    cleaned = load_cleaned_abstract(settings.database_path, settings.data_dir, paper_id)
    return _paper_response(
        catalog.get_paper(paper_id),
        cleaned_abstract=cleaned.cleaned_abstract if cleaned is not None else None,
    )


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


@router.put("/{paper_id}/tags/{tag_id}", response_model=PaperResponse)
def add_paper_tag(paper_id: str, tag_id: str, catalog: CatalogDependency) -> PaperResponse:
    catalog.get_paper(paper_id)
    catalog.get_tag(tag_id)
    catalog.add_paper_tag(paper_id, tag_id)
    return _paper_response(catalog.get_paper(paper_id))


@router.delete("/{paper_id}/tags/{tag_id}", response_model=PaperResponse)
def remove_paper_tag(paper_id: str, tag_id: str, catalog: CatalogDependency) -> PaperResponse:
    paper = catalog.get_paper(paper_id)
    catalog.get_tag(tag_id)
    if tag_id in paper.tag_ids:
        catalog.remove_paper_tag(paper_id, tag_id)
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


@router.get("/{paper_id}/note", response_model=NoteResponse)
def get_note(paper_id: str, catalog: CatalogDependency) -> NoteResponse:
    return NoteResponse(paper_id=paper_id, content=catalog.get_paper_note(paper_id))


@router.put("/{paper_id}/note", response_model=NoteResponse)
def update_note(
    paper_id: str, payload: PaperNoteUpdateRequest, catalog: CatalogDependency
) -> NoteResponse:
    content = catalog.update_paper_note(paper_id, payload.content)
    return NoteResponse(paper_id=paper_id, content=content)


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


def _paper_response(paper: PaperView, *, cleaned_abstract: str | None = None) -> PaperResponse:
    kinds = set(paper.artifact_kinds)
    return PaperResponse(
        id=paper.id,
        title=paper.title,
        # Core 0.4 builds from before schema v4 do not expose abstracts.
        abstract=getattr(paper, "abstract", None),
        cleaned_abstract=cleaned_abstract,
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
