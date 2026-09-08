"""Archived QA record search and export API adapter."""

from typing import Annotated

from fastapi import APIRouter, Query
from passagen.assistant.schemas import QaRecord

from passagen_web.dependencies import AssistantDependency
from passagen_web.schemas.qa_records import (
    QaRecordArchiveRequest,
    QaRecordListResponse,
    QaRecordSummaryResponse,
)

router = APIRouter(prefix="/qa-records", tags=["qa-records"])


@router.get("", response_model=QaRecordListResponse)
def search_qa_records(
    assistant: AssistantDependency,
    q: Annotated[str | None, Query()] = None,
    archived: Annotated[bool | None, Query()] = None,
    paper_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> QaRecordListResponse:
    records = assistant.search_qa_records(q, archived=archived, paper_id=paper_id, limit=limit)
    return QaRecordListResponse(items=[_summary(assistant, record) for record in records])


@router.get("/{qa_record_id}")
def get_qa_record(qa_record_id: str, assistant: AssistantDependency) -> dict[str, object]:
    """Full structured export of one QA record."""

    return assistant.get_qa_record(qa_record_id).model_dump(mode="json")


@router.patch("/{qa_record_id}", response_model=QaRecordSummaryResponse)
def update_qa_record_archive(
    qa_record_id: str, payload: QaRecordArchiveRequest, assistant: AssistantDependency
) -> QaRecordSummaryResponse:
    if payload.archived:
        record = assistant.archive_qa_record(
            qa_record_id, title=payload.title or "", tags=payload.tags
        )
    else:
        record = assistant.unarchive_qa_record(qa_record_id)
    return _summary(assistant, record)


def _summary(assistant: AssistantDependency, record: QaRecord) -> QaRecordSummaryResponse:
    snapshot = record.source_snapshot
    paper_id = snapshot.paper.paper_id if snapshot.paper is not None else None
    status = assistant.source_status(record)
    reused_from = record.context_plan.reuse_qa_id
    return QaRecordSummaryResponse(
        id=record.id,
        conversation_id=record.conversation_id,
        paper_id=paper_id,
        standalone_question=record.standalone_question,
        answer_markdown=record.answer.answer_markdown,
        intent=record.intent.value,
        archived_at=record.archived_at,
        archive_title=record.archive_title,
        archive_tags=list(record.archive_tags),
        citation_count=len(record.answer.citations),
        created_at=record.created_at,
        disposition="exact_reuse" if reused_from else "generated",
        reused_from_qa_id=reused_from,
        stale=status.stale,
        stale_reasons=status.reasons,
    )
