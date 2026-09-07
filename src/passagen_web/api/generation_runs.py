"""Generation run status API adapter (polling target for answer turns)."""

from fastapi import APIRouter
from passagen.assistant.repository import GenerationLlmCallRecord

from passagen_web.dependencies import AssistantDependency
from passagen_web.schemas.qa_records import (
    GenerationLlmCallResponse,
    GenerationRunResponse,
)

router = APIRouter(prefix="/generation-runs", tags=["generation-runs"])


@router.get("/{run_id}", response_model=GenerationRunResponse)
def get_generation_run(run_id: str, assistant: AssistantDependency) -> GenerationRunResponse:
    run = assistant.get_generation_run(run_id)
    calls = assistant.list_generation_llm_calls(run_id)
    return GenerationRunResponse(
        id=run.id,
        kind=run.kind,
        status=run.status,
        error_code=run.error_code,
        error_message=run.error_message,
        created_at=run.created_at,
        started_at=run.started_at,
        completed_at=run.completed_at,
        llm_calls=[_call_model(call) for call in calls],
        input_tokens=sum(call.input_tokens or 0 for call in calls),
        output_tokens=sum(call.output_tokens or 0 for call in calls),
    )


def _call_model(call: GenerationLlmCallRecord) -> GenerationLlmCallResponse:
    return GenerationLlmCallResponse(
        stage=call.stage,
        provider=call.provider,
        model=call.model,
        input_tokens=call.input_tokens,
        output_tokens=call.output_tokens,
        finish_reason=call.finish_reason,
        error_message=call.error_message,
    )
