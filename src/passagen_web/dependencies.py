from typing import Annotated, cast

from fastapi import Depends, Request
from passagen.catalog import CatalogService

from passagen_web.config import Settings


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_catalog(request: Request) -> CatalogService:
    return cast(CatalogService, request.app.state.catalog)


SettingsDependency = Annotated[Settings, Depends(get_settings)]
CatalogDependency = Annotated[CatalogService, Depends(get_catalog)]
