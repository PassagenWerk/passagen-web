from fastapi import APIRouter, Response, status
from passagen.assistant.schemas import SourceSnapshot
from passagen.catalog import (
    CatalogNotFoundError,
    CatalogService,
    Collection,
    CollectionDocument,
)
from passagen.research import CollectionReportView, render_report_markdown
from pydantic import ValidationError

from passagen_web.api.papers import _paper_response
from passagen_web.dependencies import CatalogDependency, DispatcherDependency
from passagen_web.schemas.collections import (
    CollectionCreateRequest,
    CollectionDocumentCreateRequest,
    CollectionDocumentPaperChangesResponse,
    CollectionDocumentPaperResponse,
    CollectionDocumentResponse,
    CollectionDocumentSummaryResponse,
    CollectionDocumentUpdateRequest,
    CollectionMemberResponse,
    CollectionOrderRequest,
    CollectionPapersRequest,
    CollectionResponse,
    CollectionSummaryResponse,
    CollectionUpdateRequest,
)

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("", response_model=list[CollectionSummaryResponse])
def list_collections(catalog: CatalogDependency) -> list[CollectionSummaryResponse]:
    return [
        _collection_summary(catalog.get_collection(collection.id))
        for collection in catalog.list_collections()
    ]


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
def create_collection(
    payload: CollectionCreateRequest, catalog: CatalogDependency
) -> CollectionResponse:
    return _collection_response(
        catalog.create_collection(payload.name, payload.description), catalog
    )


@router.get("/{collection_id}", response_model=CollectionResponse)
def get_collection(collection_id: str, catalog: CatalogDependency) -> CollectionResponse:
    return _collection_response(catalog.get_collection(collection_id), catalog)


@router.patch("/{collection_id}", response_model=CollectionResponse)
def update_collection(
    collection_id: str, payload: CollectionUpdateRequest, catalog: CatalogDependency
) -> CollectionResponse:
    current = catalog.get_collection(collection_id)
    description = (
        payload.description if "description" in payload.model_fields_set else current.description
    )
    collection = catalog.update_collection(
        collection_id,
        name=payload.name,
        description=description,
    )
    return _collection_response(collection, catalog)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(collection_id: str, catalog: CatalogDependency) -> Response:
    catalog.delete_collection(collection_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{collection_id}/papers", response_model=CollectionResponse)
def add_collection_papers(
    collection_id: str, payload: CollectionPapersRequest, catalog: CatalogDependency
) -> CollectionResponse:
    return _collection_response(
        catalog.add_collection_papers(collection_id, payload.paper_ids), catalog
    )


@router.patch("/{collection_id}/papers/order", response_model=CollectionResponse)
def reorder_collection_papers(
    collection_id: str, payload: CollectionOrderRequest, catalog: CatalogDependency
) -> CollectionResponse:
    return _collection_response(
        catalog.reorder_collection(collection_id, payload.paper_ids), catalog
    )


@router.delete("/{collection_id}/papers/{paper_id}", response_model=CollectionResponse)
def remove_collection_paper(
    collection_id: str, paper_id: str, catalog: CatalogDependency
) -> CollectionResponse:
    return _collection_response(catalog.remove_collection_paper(collection_id, paper_id), catalog)


@router.get("/{collection_id}/documents", response_model=list[CollectionDocumentSummaryResponse])
def list_collection_documents(
    collection_id: str, catalog: CatalogDependency, dispatcher: DispatcherDependency
) -> list[CollectionDocumentSummaryResponse]:
    manual = [
        _collection_document_summary(document, catalog)
        for document in catalog.list_collection_documents(collection_id)
    ]
    generated = [
        _report_document_summary(view, catalog)
        for view in dispatcher.reports.list_reports(collection_id)
    ]
    return sorted([*manual, *generated], key=lambda item: (item.updated_at, item.id), reverse=True)


@router.post(
    "/{collection_id}/documents",
    response_model=CollectionDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_collection_document(
    collection_id: str,
    payload: CollectionDocumentCreateRequest,
    catalog: CatalogDependency,
) -> CollectionDocumentResponse:
    return _collection_document_response(
        catalog.create_collection_document(
            collection_id,
            title=payload.title,
            content_markdown=payload.content_markdown,
            source="web",
        ),
        catalog,
    )


@router.get("/{collection_id}/documents/{document_id}", response_model=CollectionDocumentResponse)
def get_collection_document(
    collection_id: str,
    document_id: str,
    catalog: CatalogDependency,
    dispatcher: DispatcherDependency,
) -> CollectionDocumentResponse:
    manual = _find_manual_document(catalog, collection_id, document_id)
    if manual is not None:
        return _collection_document_response(manual, catalog)
    view = dispatcher.reports.get_report(document_id)
    if view.record.collection_id != collection_id:
        raise CatalogNotFoundError(f"Collection document not found: {document_id}")
    return _report_document_response(view, catalog)


@router.patch("/{collection_id}/documents/{document_id}", response_model=CollectionDocumentResponse)
def update_collection_document(
    collection_id: str,
    document_id: str,
    payload: CollectionDocumentUpdateRequest,
    catalog: CatalogDependency,
    dispatcher: DispatcherDependency,
) -> CollectionDocumentResponse:
    if _find_manual_document(catalog, collection_id, document_id) is None:
        view = dispatcher.reports.get_report(document_id)
        if view.record.collection_id != collection_id:
            raise CatalogNotFoundError(f"Collection document not found: {document_id}")
        updated = dispatcher.reports.update_report_document(
            document_id,
            title=payload.title if payload.title is not None else view.record.title,
            markdown=(
                payload.content_markdown
                if payload.content_markdown is not None
                else view.record.edited_markdown
                or (render_report_markdown(view.report) if view.report is not None else "")
            ),
            expected_revision=payload.expected_revision,
        )
        return _report_document_response(updated, catalog)
    return _collection_document_response(
        catalog.update_collection_document(
            collection_id,
            document_id,
            title=payload.title,
            content_markdown=payload.content_markdown,
            expected_revision=payload.expected_revision,
        ),
        catalog,
    )


@router.delete("/{collection_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection_document(
    collection_id: str,
    document_id: str,
    catalog: CatalogDependency,
    dispatcher: DispatcherDependency,
) -> Response:
    if _find_manual_document(catalog, collection_id, document_id) is not None:
        catalog.delete_collection_document(collection_id, document_id)
    else:
        view = dispatcher.reports.get_report(document_id)
        if view.record.collection_id != collection_id:
            raise CatalogNotFoundError(f"Collection document not found: {document_id}")
        dispatcher.reports.delete_report(document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _collection_summary(collection: Collection) -> CollectionSummaryResponse:
    return CollectionSummaryResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        paper_count=len(collection.papers),
    )


def _collection_response(collection: Collection, catalog: CatalogDependency) -> CollectionResponse:
    return CollectionResponse(
        **_collection_summary(collection).model_dump(),
        papers=[
            CollectionMemberResponse(
                paper=_paper_response(catalog.get_paper(membership.paper_id)),
                position=membership.position,
                note=membership.note,
                added_at=membership.added_at,
            )
            for membership in collection.papers
        ],
    )


def _collection_document_summary(
    document: CollectionDocument, catalog: CatalogService
) -> CollectionDocumentSummaryResponse:
    papers = [
        CollectionDocumentPaperResponse(id=item.id, title=item.title) for item in document.papers
    ]
    return CollectionDocumentSummaryResponse(
        id=document.id,
        collection_id=document.collection_id,
        title=document.title,
        document_type="manual",
        kind="markdown",
        status="ready",
        editable=True,
        source=document.source,
        external_id=document.external_id,
        revision=document.revision,
        papers=papers,
        paper_changes=_paper_changes(document.collection_id, papers, catalog),
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def _collection_document_response(
    document: CollectionDocument, catalog: CatalogService
) -> CollectionDocumentResponse:
    return CollectionDocumentResponse(
        **_collection_document_summary(document, catalog).model_dump(),
        content_markdown=document.content_markdown,
    )


def _report_document_summary(
    view: CollectionReportView, catalog: CatalogService
) -> CollectionDocumentSummaryResponse:
    try:
        snapshot = SourceSnapshot.model_validate_json(view.record.source_snapshot_json)
    except ValidationError:
        snapshot = None
    papers = [
        CollectionDocumentPaperResponse(id=paper.paper_id, title=paper.title)
        for paper in (
            snapshot.collection.papers
            if snapshot is not None and snapshot.collection is not None
            else []
        )
    ]
    return CollectionDocumentSummaryResponse(
        id=view.record.id,
        collection_id=view.record.collection_id,
        title=view.record.title,
        document_type="generated",
        kind=view.record.kind.value,
        status=view.record.status,
        editable=view.record.status == "completed",
        source="generated",
        external_id=None,
        revision=view.record.revision,
        papers=papers,
        paper_changes=_paper_changes(view.record.collection_id, papers, catalog),
        created_at=view.record.created_at,
        updated_at=view.record.updated_at or view.record.completed_at or view.record.created_at,
    )


def _report_document_response(
    view: CollectionReportView, catalog: CatalogService
) -> CollectionDocumentResponse:
    return CollectionDocumentResponse(
        **_report_document_summary(view, catalog).model_dump(),
        content_markdown=(
            view.record.edited_markdown
            or (render_report_markdown(view.report) if view.report is not None else None)
        ),
    )


def _paper_changes(
    collection_id: str,
    saved: list[CollectionDocumentPaperResponse],
    catalog: CatalogService,
) -> CollectionDocumentPaperChangesResponse:
    collection = catalog.get_collection(collection_id)
    current = [
        CollectionDocumentPaperResponse(
            id=member.paper_id,
            title=catalog.get_paper(member.paper_id).title,
        )
        for member in collection.papers
    ]
    saved_ids = [paper.id for paper in saved]
    current_ids = [paper.id for paper in current]
    saved_set = set(saved_ids)
    current_set = set(current_ids)
    return CollectionDocumentPaperChangesResponse(
        added=[paper for paper in current if paper.id not in saved_set],
        removed=[paper for paper in saved if paper.id not in current_set],
        order_changed=(
            [paper_id for paper_id in saved_ids if paper_id in current_set]
            != [paper_id for paper_id in current_ids if paper_id in saved_set]
        ),
    )


def _find_manual_document(
    catalog: CatalogService, collection_id: str, document_id: str
) -> CollectionDocument | None:
    return next(
        (
            document
            for document in catalog.list_collection_documents(collection_id)
            if document.id == document_id
        ),
        None,
    )
