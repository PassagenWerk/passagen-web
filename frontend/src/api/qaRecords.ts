import { requestJson } from "./papers";

export interface QaRecordSummary {
  id: string;
  conversation_id: string;
  paper_id: string | null;
  standalone_question: string;
  answer_markdown: string;
  intent: string;
  archived_at: string | null;
  archive_title: string | null;
  archive_tags: string[];
  citation_count: number;
  created_at: string;
}

export interface QaRecordExport {
  id: string;
  standalone_question: string;
  [key: string]: unknown;
}

export function searchQaRecords(params: {
  q?: string;
  archived?: boolean;
  paperId?: string;
}): Promise<{ items: QaRecordSummary[] }> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.archived !== undefined) query.set("archived", String(params.archived));
  if (params.paperId) query.set("paper_id", params.paperId);
  return requestJson(`/api/qa-records?${query.toString()}`);
}

export function fetchQaRecord(id: string): Promise<QaRecordExport> {
  return requestJson(`/api/qa-records/${encodeURIComponent(id)}`);
}

export function archiveQaRecord(
  id: string,
  title: string,
  tags: string[],
): Promise<QaRecordSummary> {
  return requestJson(`/api/qa-records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: true, title, tags }),
  });
}

export function unarchiveQaRecord(id: string): Promise<QaRecordSummary> {
  return requestJson(`/api/qa-records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: false }),
  });
}
