from fastapi import APIRouter, Response, status
from passagen.catalog import Tag

from passagen_web.dependencies import CatalogDependency
from passagen_web.schemas.tags import TagCreateRequest, TagResponse, TagUpdateRequest

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
def list_tags(catalog: CatalogDependency) -> list[TagResponse]:
    return [
        TagResponse(id=tag.id, name=tag.name, color=tag.color, created_at=tag.created_at)
        for tag in catalog.list_tags()
    ]


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(payload: TagCreateRequest, catalog: CatalogDependency) -> TagResponse:
    return _tag_response(catalog.create_tag(payload.name, payload.color))


@router.patch("/{tag_id}", response_model=TagResponse)
def update_tag(tag_id: str, payload: TagUpdateRequest, catalog: CatalogDependency) -> TagResponse:
    current = next((tag for tag in catalog.list_tags() if tag.id == tag_id), None)
    if current is None:
        return _tag_response(catalog.update_tag(tag_id, name=payload.name, color=payload.color))
    color = payload.color if "color" in payload.model_fields_set else current.color
    return _tag_response(catalog.update_tag(tag_id, name=payload.name, color=color))


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: str, catalog: CatalogDependency) -> Response:
    catalog.delete_tag(tag_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _tag_response(tag: Tag) -> TagResponse:
    return TagResponse(id=tag.id, name=tag.name, color=tag.color, created_at=tag.created_at)
