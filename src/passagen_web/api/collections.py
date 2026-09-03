from fastapi import APIRouter, Response, status
from passagen.catalog import Collection

from passagen_web.api.papers import _paper_response
from passagen_web.dependencies import CatalogDependency
from passagen_web.schemas.collections import (
    CollectionCreateRequest,
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
