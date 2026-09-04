import { requestJson, responseError } from "./papers";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "interrupted";
export type RebuildStage = "metadata" | "parse" | "summary";

export interface RunPaperFailure {
  paper_id: string;
  category: string;
  message: string;
}

export interface RunResult {
  updated: string[];
  skipped: string[];
  failed: RunPaperFailure[];
  warnings: RunPaperFailure[];
}

export interface ProcessingRun {
  id: string;
  paper_ids: string[];
  mode: "continue" | "rebuild";
  from_stage: string | null;
  status: RunStatus;
  current_paper_id: string | null;
  current_stage: string | null;
  created_at: string;
  finished_at: string | null;
  error: string | null;
  result: RunResult | null;
}

export interface ProgressEvent {
  sequence: number;
  run_id: string;
  paper_id: string | null;
  stage: string;
  current: number;
  total: number;
  message: string;
}

export interface ImportFailure {
  filename: string;
  reason: string;
  message: string;
}

export interface ImportResult {
  added: string[];
  duplicates: string[];
  failed: ImportFailure[];
}

export function isActiveRun(run: ProcessingRun): boolean {
  return run.status === "queued" || run.status === "running";
}

export async function fetchRuns(params: {
  status?: RunStatus;
  paperId?: string;
  limit?: number;
}): Promise<ProcessingRun[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.paperId) query.set("paper_id", params.paperId);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString();
  const body = await requestJson<{ items: ProcessingRun[] }>(
    `/api/processing-runs${suffix ? `?${suffix}` : ""}`,
  );
  return body.items;
}

export function fetchRun(runId: string): Promise<ProcessingRun> {
  return requestJson<ProcessingRun>(`/api/processing-runs/${encodeURIComponent(runId)}`);
}

export async function fetchRunEvents(runId: string): Promise<ProgressEvent[]> {
  const body = await requestJson<{ items: ProgressEvent[] }>(
    `/api/processing-runs/${encodeURIComponent(runId)}/events`,
  );
  return body.items;
}

export function createRun(
  paperIds: string[],
  mode: "continue" | "rebuild" = "continue",
  fromStage?: RebuildStage,
): Promise<ProcessingRun> {
  return requestJson<ProcessingRun>("/api/processing-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paper_ids: paperIds,
      mode,
      from_stage: fromStage ?? null,
    }),
  });
}

export async function importPapers(files: File[]): Promise<ImportResult> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);
  const response = await fetch("/api/papers/import", { method: "POST", body: form });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<ImportResult>;
}
