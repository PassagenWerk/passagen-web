export interface ArtifactAvailability {
  summary: boolean;
  outline: boolean;
  pdf: boolean;
}

export interface Paper {
  id: string;
  title: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxiv_id: string | null;
  source_url: string | null;
  original_filename: string;
  status: string;
  imported_at: string;
  updated_at: string;
  metadata_sources: Record<string, string>;
  tag_ids: string[];
  artifacts: ArtifactAvailability;
}

export interface PaperPage {
  items: Paper[];
  total: number;
  limit: number;
  offset: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface SummaryResponse {
  paper_id: string;
  content: Record<string, unknown>;
}

export interface OutlineResponse {
  paper_id: string;
  content: string;
}

export async function fetchPapers(search: URLSearchParams): Promise<PaperPage> {
  const query = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "tag",
    "venue",
    "year",
    "collection",
    "sort",
    "direction",
    "limit",
    "offset",
  ]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return requestJson<PaperPage>(`/api/papers?${query.toString()}`);
}

export function fetchPaper(paperId: string): Promise<Paper> {
  return requestJson<Paper>(`/api/papers/${encodeURIComponent(paperId)}`);
}

export function fetchTags(): Promise<Tag[]> {
  return requestJson<Tag[]>("/api/tags");
}

export function fetchSummary(paperId: string): Promise<SummaryResponse> {
  return requestJson<SummaryResponse>(`/api/papers/${encodeURIComponent(paperId)}/summary`);
}

export function fetchOutline(paperId: string): Promise<OutlineResponse> {
  return requestJson<OutlineResponse>(`/api/papers/${encodeURIComponent(paperId)}/outline`);
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}
