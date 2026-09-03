from pydantic import BaseModel


class TagResponse(BaseModel):
    id: str
    name: str
    color: str | None
    created_at: str
