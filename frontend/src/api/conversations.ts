import { requestJson } from "./papers";

export type ConversationScope = "paper" | "collection";

export interface Conversation {
  id: string;
  scope: ConversationScope;
  paper_id: string | null;
  collection_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  citation_id: string;
  paper_id: string;
  artifact_kind: string;
  summary_path: string | null;
  section: string | null;
  page_start: number | null;
  page_end: number | null;
  excerpt: string | null;
}

export type MessageStatus = "pending" | "completed" | "failed";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  run_id: string | null;
  created_at: string;
  qa_record_id: string | null;
  sources: string[] | null;
  selected_paper_ids: string[] | null;
  archived: boolean;
  citations: Citation[] | null;
  error_code: string | null;
  error_message: string | null;
  llm_call_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  disposition: "generated" | "exact_reuse" | null;
  reused_from_qa_id: string | null;
  stale: boolean;
  stale_reasons: string[];
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ConversationMessage[];
}

export interface RunStatus {
  id: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  llm_call_count: number;
  input_tokens: number;
  output_tokens: number;
}

export interface Turn {
  message: ConversationMessage;
  run: RunStatus | null;
}

/** Scope selector: exactly one of paperId / collectionId. */
export type AskScopeRef = { paperId: string } | { collectionId: string };

function scopeQuery(scope: AskScopeRef): string {
  return "paperId" in scope
    ? `paper_id=${encodeURIComponent(scope.paperId)}`
    : `collection_id=${encodeURIComponent(scope.collectionId)}`;
}

export function fetchConversations(scope: AskScopeRef): Promise<{ items: Conversation[] }> {
  return requestJson(`/api/conversations?${scopeQuery(scope)}`);
}

export function createConversation(scope: AskScopeRef): Promise<Conversation> {
  const body =
    "paperId" in scope ? { paper_id: scope.paperId } : { collection_id: scope.collectionId };
  return requestJson("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function renameConversation(id: string, title: string): Promise<Conversation> {
  return requestJson(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Delete failed with status ${response.status}`);
}

export function fetchConversation(id: string): Promise<ConversationDetail> {
  return requestJson(`/api/conversations/${encodeURIComponent(id)}`);
}

export function submitTurn(
  conversationId: string,
  question: string,
  options?: { forceRegenerate?: boolean },
): Promise<Turn> {
  return requestJson(`/api/conversations/${encodeURIComponent(conversationId)}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, force_regenerate: options?.forceRegenerate ?? false }),
  });
}

export function fetchTurn(conversationId: string, messageId: string): Promise<Turn> {
  return requestJson(
    `/api/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(messageId)}`,
  );
}
