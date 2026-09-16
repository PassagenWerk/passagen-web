import { requestJson, responseError, type Paper } from "./papers";

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  paper_count: number;
}

export interface CollectionMember {
  paper: Paper;
  position: number;
  note: string | null;
  added_at: string;
}

export interface Collection extends CollectionSummary {
  papers: CollectionMember[];
}

export interface CollectionDocumentSummary {
  id: string;
  collection_id: string;
  title: string;
  document_type: "manual" | "generated";
  kind: string;
  status: string;
  editable: boolean;
  source: string;
  external_id: string | null;
  revision: number | null;
  papers: CollectionDocumentPaper[];
  paper_changes: CollectionDocumentPaperChanges;
  created_at: string;
  updated_at: string;
}

export interface CollectionDocument extends CollectionDocumentSummary {
  content_markdown: string | null;
}

export interface CollectionDocumentPaper {
  id: string;
  title: string | null;
}

export interface CollectionDocumentPaperChanges {
  added: CollectionDocumentPaper[];
  removed: CollectionDocumentPaper[];
  order_changed: boolean;
}

export function fetchCollections(): Promise<CollectionSummary[]> {
  return requestJson<CollectionSummary[]>("/api/collections");
}

export function fetchCollection(collectionId: string): Promise<Collection> {
  return requestJson<Collection>(`/api/collections/${encodeURIComponent(collectionId)}`);
}

export function createCollection(name: string, description: string): Promise<Collection> {
  return requestJson<Collection>("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description || null }),
  });
}

export function updateCollection(
  collectionId: string,
  name: string,
  description: string,
): Promise<Collection> {
  return requestJson<Collection>(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description || null }),
  });
}

export async function deleteCollection(collectionId: string): Promise<void> {
  const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw await responseError(response);
}

export function addCollectionPapers(collectionId: string, paperIds: string[]): Promise<Collection> {
  return requestJson<Collection>(
    `/api/collections/${encodeURIComponent(collectionId)}/papers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper_ids: paperIds }),
    },
  );
}

export function reorderCollection(collectionId: string, paperIds: string[]): Promise<Collection> {
  return requestJson<Collection>(
    `/api/collections/${encodeURIComponent(collectionId)}/papers/order`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper_ids: paperIds }),
    },
  );
}

export function removeCollectionPaper(collectionId: string, paperId: string): Promise<Collection> {
  return requestJson<Collection>(
    `/api/collections/${encodeURIComponent(collectionId)}/papers/${encodeURIComponent(paperId)}`,
    { method: "DELETE" },
  );
}

export function fetchCollectionDocuments(
  collectionId: string,
): Promise<CollectionDocumentSummary[]> {
  return requestJson<CollectionDocumentSummary[]>(
    `/api/collections/${encodeURIComponent(collectionId)}/documents`,
  );
}

export function fetchCollectionDocument(
  collectionId: string,
  documentId: string,
): Promise<CollectionDocument> {
  return requestJson<CollectionDocument>(
    `/api/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`,
  );
}

export function createCollectionDocument(
  collectionId: string,
  title: string,
  contentMarkdown: string,
): Promise<CollectionDocument> {
  return requestJson<CollectionDocument>(
    `/api/collections/${encodeURIComponent(collectionId)}/documents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content_markdown: contentMarkdown }),
    },
  );
}

export function updateCollectionDocument(
  collectionId: string,
  documentId: string,
  update: { title: string; content_markdown: string; expected_revision: number },
): Promise<CollectionDocument> {
  return requestJson<CollectionDocument>(
    `/api/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    },
  );
}

export async function deleteCollectionDocument(
  collectionId: string,
  documentId: string,
): Promise<void> {
  const response = await fetch(
    `/api/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw await responseError(response);
}
