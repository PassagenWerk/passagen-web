import type { Citation } from "./conversations";
import { requestJson, responseError } from "./papers";

export interface SourceStatus {
  stale: boolean;
  reasons: string[];
}

export interface SynthesisCoverage {
  included_paper_ids: string[];
  missing_summary_paper_ids: string[];
  partial: boolean;
}

export interface AnswerClaim {
  text: string;
  citation_ids: string[];
}

export interface SynthesisTheme {
  name: string;
  description: string;
  paper_ids: string[];
  citation_ids: string[];
}

export interface SynthesisPaperRole {
  paper_id: string;
  role: string;
  contribution: string;
  method: string | null;
  citation_ids: string[];
}

export interface SynthesisInsight {
  name: string;
  description: string;
  paper_ids: string[];
  citation_ids: string[];
}

export interface SynthesisOpenQuestion {
  question: string;
  rationale: string;
  paper_ids: string[];
  citation_ids: string[];
}

export interface ComparisonCell {
  dimension: string;
  value: string;
  citation_ids: string[];
}

export interface ComparisonRow {
  paper_id: string;
  cells: ComparisonCell[];
}

export interface ComparisonMatrix {
  dimensions: string[];
  rows: ComparisonRow[];
}

export interface CollectionSynthesis {
  schema_version: string;
  executive_overview: string;
  paper_roles: SynthesisPaperRole[];
  themes: SynthesisTheme[];
  comparison_matrix: ComparisonMatrix;
  agreements: SynthesisInsight[];
  disagreements: SynthesisInsight[];
  complementary_contributions: SynthesisInsight[];
  gaps: SynthesisInsight[];
  open_questions: SynthesisOpenQuestion[];
  claims: AnswerClaim[];
  citations: Citation[];
  coverage: SynthesisCoverage;
}

export interface CollectionArtifact {
  id: string;
  collection_id: string;
  generation_run_id: string | null;
  kind: string;
  path: string;
  version: string;
  sha256: string;
  size_bytes: number;
  source_fingerprint: string;
  created_at: string;
}

export interface CollectionSynthesisResult {
  synthesis: CollectionSynthesis;
  run_id: string | null;
  artifacts: CollectionArtifact[];
  source_status: SourceStatus;
  disposition: "generated" | "reused";
  strategy: "direct" | "map_reduce" | "reused";
}

export interface SynthesisSubmission {
  run_id: string | null;
  result: CollectionSynthesisResult | null;
}

export type ReportKind = "review" | "comparison" | "gaps" | "custom";

export interface ReportSection {
  heading: string;
  body_markdown: string;
  claims: AnswerClaim[];
}

export interface CollectionReport {
  schema_version: string;
  kind: ReportKind;
  title: string;
  user_prompt: string | null;
  synthesis_artifact_id: string | null;
  coverage: SynthesisCoverage;
  sections: ReportSection[];
  claims: AnswerClaim[];
  citations: Citation[];
}

export interface CollectionReportRecord {
  id: string;
  collection_id: string;
  kind: ReportKind;
  status: "queued" | "running" | "completed" | "failed";
  title: string;
  user_prompt: string | null;
  source_snapshot_json: string;
  source_fingerprint: string;
  run_id: string | null;
  report_artifact_id: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CollectionReportResult {
  record: CollectionReportRecord;
  report: CollectionReport;
  artifacts: CollectionArtifact[];
  source_status: SourceStatus;
  disposition: "generated" | "reused";
}

export interface CollectionReportView {
  record: CollectionReportRecord;
  report: CollectionReport | null;
  artifacts: CollectionArtifact[];
  source_status: SourceStatus;
}

export interface ReportSubmission {
  report_id: string | null;
  run_id: string | null;
  result: CollectionReportResult | null;
}

export interface CollectionRun {
  id: string;
  kind: string;
  status: string;
  report_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface GenerationRun {
  id: string;
  kind: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  input_tokens: number;
  output_tokens: number;
}

/** Latest synthesis, or null when none exists yet (404). */
export async function fetchSynthesis(
  collectionId: string,
): Promise<CollectionSynthesisResult | null> {
  const response = await fetch(
    `/api/collections/${encodeURIComponent(collectionId)}/synthesis`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Synthesis failed with status ${response.status}`);
  return (await response.json()) as CollectionSynthesisResult;
}

export function submitSynthesis(
  collectionId: string,
  options: { allowPartial?: boolean; force?: boolean } = {},
): Promise<SynthesisSubmission> {
  return requestJson(`/api/collections/${encodeURIComponent(collectionId)}/synthesis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      allow_partial: options.allowPartial ?? false,
      force: options.force ?? false,
    }),
  });
}

export function submitReport(
  collectionId: string,
  payload: {
    kind: ReportKind;
    userPrompt?: string;
    allowPartial?: boolean;
    force?: boolean;
  },
): Promise<ReportSubmission> {
  return requestJson(`/api/collections/${encodeURIComponent(collectionId)}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: payload.kind,
      user_prompt: payload.userPrompt ?? null,
      allow_partial: payload.allowPartial ?? false,
      force: payload.force ?? false,
    }),
  });
}

export function fetchReports(collectionId: string): Promise<{ items: CollectionReportView[] }> {
  return requestJson(`/api/collections/${encodeURIComponent(collectionId)}/reports`);
}

export function fetchReport(
  collectionId: string,
  reportId: string,
): Promise<CollectionReportView> {
  return requestJson(
    `/api/collections/${encodeURIComponent(collectionId)}/reports/${encodeURIComponent(reportId)}`,
  );
}

export async function deleteReport(collectionId: string, reportId: string): Promise<void> {
  const response = await fetch(
    `/api/collections/${encodeURIComponent(collectionId)}/reports/${encodeURIComponent(reportId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw await responseError(response);
}

export function fetchCollectionRuns(collectionId: string): Promise<{ items: CollectionRun[] }> {
  return requestJson(`/api/collections/${encodeURIComponent(collectionId)}/runs`);
}

export function fetchGenerationRun(runId: string): Promise<GenerationRun> {
  return requestJson(`/api/generation-runs/${encodeURIComponent(runId)}`);
}
