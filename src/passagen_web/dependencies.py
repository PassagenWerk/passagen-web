from typing import Annotated, cast

from fastapi import Depends, Request

from passagen_web.config import Settings


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


SettingsDependency = Annotated[Settings, Depends(get_settings)]
