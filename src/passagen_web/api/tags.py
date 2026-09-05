from fastapi import APIRouter, Response, status
from passagen.catalog import Tag, TagUsage

from passagen_web.dependencies import CatalogDependency
from passagen_web.schemas.tags import TagCreateRequest, TagResponse, TagUpdateRequest

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
def list_tags(catalog: CatalogDependency) -> list[TagResponse]:
    return [_usage_response(tag) for tag in catalog.list_tag_usage()]


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(payload: TagCreateRequest, catalog: CatalogDependency) -> TagResponse:
    return _tag_response(catalog.create_tag(payload.name, payload.color), paper_count=0)


@router.patch("/{tag_id}", response_model=TagResponse)
def update_tag(tag_id: str, payload: TagUpdateRequest, catalog: CatalogDependency) -> TagResponse:
    current = next((tag for tag in catalog.list_tags() if tag.id == tag_id), None)
    if current is None:
        catalog.update_tag(tag_id, name=payload.name, color=payload.color)
    else:
        color = payload.color if "color" in payload.model_fields_set else current.color
        catalog.update_tag(tag_id, name=payload.name, color=color)
    usage = next((tag for tag in catalog.list_tag_usage() if tag.id == tag_id), None)
    if usage is None:  # pragma: no cover - update_tag would have raised first
        raise AssertionError("Updated tag is missing from the usage projection")
    return _usage_response(usage)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: str, catalog: CatalogDependency) -> Response:
    catalog.delete_tag(tag_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _tag_response(tag: Tag, *, paper_count: int) -> TagResponse:
    return TagResponse(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at,
        paper_count=paper_count,
    )


def _usage_response(tag: TagUsage) -> TagResponse:
    return TagResponse(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at,
        paper_count=tag.paper_count,
    )
