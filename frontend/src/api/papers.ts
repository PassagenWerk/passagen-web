export interface ArtifactAvailability {
  summary: boolean;
  outline: boolean;
  pdf: boolean;
}

export interface Paper {
  id: string;
  title: string | null;
  abstract: string | null;
  cleaned_abstract: string | null;
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
  collection_ids: string[];
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
  paper_count: number;
}

export interface SummaryResponse {
  paper_id: string;
  content: Record<string, unknown>;
}

export interface OutlineResponse {
  paper_id: string;
  content: string;
}

export interface NoteResponse {
  paper_id: string;
  content: string;
}

export interface MetadataUpdate {
  title?: string;
  venue?: string;
  year?: number;
  expected_updated_at: string;
}

export const DEFAULT_TAG_COLOR = "#6b705c";

export async function fetchPapers(search: URLSearchParams): Promise<PaperPage> {
  const query = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "venue",
    "year",
    "collection",
    "unfiled",
    "sort",
    "direction",
    "tag_match",
    "limit",
    "offset",
  ]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  for (const tagId of search.getAll("tag")) {
    if (tagId) query.append("tag", tagId);
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

export function fetchNote(paperId: string): Promise<NoteResponse> {
  return requestJson<NoteResponse>(`/api/papers/${encodeURIComponent(paperId)}/note`);
}

export function updatePaperNote(paperId: string, content: string): Promise<NoteResponse> {
  return requestJson<NoteResponse>(`/api/papers/${encodeURIComponent(paperId)}/note`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export function updatePaperMetadata(paperId: string, update: MetadataUpdate): Promise<Paper> {
  return requestJson<Paper>(`/api/papers/${encodeURIComponent(paperId)}/metadata`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export function updatePaperTags(paperId: string, tagIds: string[]): Promise<Paper> {
  return requestJson<Paper>(`/api/papers/${encodeURIComponent(paperId)}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_ids: tagIds }),
  });
}

export function addPaperTag(paperId: string, tagId: string): Promise<Paper> {
  return requestJson<Paper>(
    `/api/papers/${encodeURIComponent(paperId)}/tags/${encodeURIComponent(tagId)}`,
    { method: "PUT" },
  );
}

export function removePaperTag(paperId: string, tagId: string): Promise<Paper> {
  return requestJson<Paper>(
    `/api/papers/${encodeURIComponent(paperId)}/tags/${encodeURIComponent(tagId)}`,
    { method: "DELETE" },
  );
}

export function createTag(name: string, color: string = DEFAULT_TAG_COLOR): Promise<Tag> {
  return requestJson<Tag>("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
}

export function updateTag(tagId: string, name: string, color: string): Promise<Tag> {
  return requestJson<Tag>(`/api/tags/${encodeURIComponent(tagId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
}

export async function deleteTag(tagId: string): Promise<void> {
  const response = await fetch(`/api/tags/${encodeURIComponent(tagId)}`, { method: "DELETE" });
  if (!response.ok) throw await responseError(response);
}

export function pdfUrl(paperId: string): string {
  return `/api/papers/${encodeURIComponent(paperId)}/pdf`;
}

export async function checkPdf(paperId: string): Promise<boolean> {
  const response = await fetch(pdfUrl(paperId), { headers: { Range: "bytes=0-0" } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(body?.error?.message ?? `PDF request failed with status ${response.status}`);
  }
  return true;
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = init ? await fetch(url, init) : await fetch(url);
  if (!response.ok) {
    throw await responseError(response);
  }
  return response.json() as Promise<T>;
}

export async function responseError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return new Error(body?.error?.message ?? `Request failed with status ${response.status}`);
}
