from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, model_validator

Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class TagResponse(BaseModel):
    id: str
    name: str
    color: str | None
    created_at: str


class TagCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    color: Color | None = None


class TagUpdateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    color: Color | None = None

    @model_validator(mode="after")
    def require_change(self) -> TagUpdateRequest:
        if not self.model_fields_set:
            raise ValueError("at least one tag field is required")
        return self
