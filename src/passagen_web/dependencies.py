from typing import Annotated, cast

from fastapi import Depends, Request
from passagen.assistant import ConversationService
from passagen.catalog import CatalogService
from passagen.generation import GenerationRunDispatcher
from passagen.processing import ProcessingService

from passagen_web.config import Settings


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_catalog(request: Request) -> CatalogService:
    return cast(CatalogService, request.app.state.catalog)


def get_processing(request: Request) -> ProcessingService:
    return cast(ProcessingService, request.app.state.processing)


def get_assistant(request: Request) -> ConversationService:
    return cast(ConversationService, request.app.state.assistant)


def get_dispatcher(request: Request) -> GenerationRunDispatcher:
    return cast(GenerationRunDispatcher, request.app.state.dispatcher)


SettingsDependency = Annotated[Settings, Depends(get_settings)]
CatalogDependency = Annotated[CatalogService, Depends(get_catalog)]
ProcessingDependency = Annotated[ProcessingService, Depends(get_processing)]
AssistantDependency = Annotated[ConversationService, Depends(get_assistant)]
DispatcherDependency = Annotated[GenerationRunDispatcher, Depends(get_dispatcher)]
