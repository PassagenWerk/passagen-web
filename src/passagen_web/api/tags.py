from fastapi import APIRouter

from passagen_web.dependencies import CatalogDependency
from passagen_web.schemas.tags import TagResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
def list_tags(catalog: CatalogDependency) -> list[TagResponse]:
    return [
        TagResponse(id=tag.id, name=tag.name, color=tag.color, created_at=tag.created_at)
        for tag in catalog.list_tags()
    ]
