"""Conversation and answer-turn API adapters.

Turns are queued and executed by the background generation worker; the API only
translates between HTTP and the Core conversation service.
"""

from fastapi import APIRouter, Response
from passagen.assistant.errors import AssistantNotFoundError
from passagen.assistant.repository import GenerationRunRecord
from passagen.assistant.schemas import Citation, Conversation, Message

from passagen_web.dependencies import AssistantDependency
from passagen_web.schemas.conversations import (
    CitationResponse,
    ConversationCreateRequest,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationRenameRequest,
    ConversationResponse,
    MessageResponse,
    RunStatusResponse,
    TurnCreateRequest,
    TurnResponse,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", status_code=201, response_model=ConversationResponse)
def create_conversation(
    payload: ConversationCreateRequest, assistant: AssistantDependency
) -> ConversationResponse:
    return _conversation_model(assistant.create_conversation(payload.paper_id, title=payload.title))


@router.get("", response_model=ConversationListResponse)
def list_conversations(paper_id: str, assistant: AssistantDependency) -> ConversationListResponse:
    return ConversationListResponse(
        items=[
            _conversation_model(conversation)
            for conversation in assistant.list_conversations(paper_id)
        ]
    )


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: str, assistant: AssistantDependency
) -> ConversationDetailResponse:
    detail = assistant.get_conversation(conversation_id)
    return ConversationDetailResponse(
        conversation=_conversation_model(detail.conversation),
        messages=[_message_response(assistant, message) for message in detail.messages],
    )


@router.patch("/{conversation_id}", response_model=ConversationResponse)
def rename_conversation(
    conversation_id: str, payload: ConversationRenameRequest, assistant: AssistantDependency
) -> ConversationResponse:
    return _conversation_model(assistant.rename_conversation(conversation_id, payload.title))


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, assistant: AssistantDependency) -> Response:
    assistant.delete_conversation(conversation_id)
    return Response(status_code=204)


@router.post("/{conversation_id}/turns", status_code=202, response_model=TurnResponse)
def submit_turn(
    conversation_id: str, payload: TurnCreateRequest, assistant: AssistantDependency
) -> TurnResponse:
    submission = assistant.submit_turn(conversation_id, payload.question)
    return TurnResponse(
        message=_message_response(assistant, submission.answer_message),
        run=_run_status(assistant, assistant.get_generation_run(submission.run_id)),
    )


@router.get("/{conversation_id}/turns/{message_id}", response_model=TurnResponse)
def get_turn(conversation_id: str, message_id: str, assistant: AssistantDependency) -> TurnResponse:
    detail = assistant.get_conversation(conversation_id)
    message = next((item for item in detail.messages if item.id == message_id), None)
    if message is None:
        raise AssistantNotFoundError(f"Message not found: {message_id}")
    run = assistant.get_generation_run(message.run_id) if message.run_id else None
    return TurnResponse(
        message=_message_response(assistant, message),
        run=_run_status(assistant, run),
    )


def _conversation_model(conversation: Conversation) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        paper_id=conversation.paper_id or "",
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


def _message_response(assistant: AssistantDependency, message: Message) -> MessageResponse:
    record = assistant.find_qa_record_for_message(message.id)
    run = None
    if message.run_id is not None:
        run = assistant.find_generation_run(message.run_id)
    calls = assistant.list_generation_llm_calls(run.id) if run is not None else ()
    return MessageResponse(
        id=message.id,
        role=message.role.value,
        content=message.content,
        status=message.status.value,
        run_id=message.run_id,
        created_at=message.created_at,
        qa_record_id=record.id if record else None,
        sources=[source.value for source in record.context_plan.sources] if record else None,
        archived=record.archived_at is not None if record else False,
        citations=[_citation_model(c) for c in record.answer.citations] if record else None,
        error_code=run.error_code if run else None,
        error_message=run.error_message if run else None,
        llm_call_count=len(calls) if run else None,
        input_tokens=sum(call.input_tokens or 0 for call in calls) if run else None,
        output_tokens=sum(call.output_tokens or 0 for call in calls) if run else None,
    )


def _citation_model(citation: Citation) -> CitationResponse:
    return CitationResponse(
        citation_id=citation.citation_id,
        artifact_kind=citation.artifact_kind.value,
        summary_path=citation.summary_path,
        section=citation.section,
        page_start=citation.page_start,
        page_end=citation.page_end,
        excerpt=citation.excerpt,
    )


def _run_status(
    assistant: AssistantDependency, run: GenerationRunRecord | None
) -> RunStatusResponse | None:
    if run is None:
        return None
    calls = assistant.list_generation_llm_calls(run.id)
    return RunStatusResponse(
        id=run.id,
        status=run.status,
        error_code=run.error_code,
        error_message=run.error_message,
        llm_call_count=len(calls),
        input_tokens=sum(call.input_tokens or 0 for call in calls),
        output_tokens=sum(call.output_tokens or 0 for call in calls),
    )
