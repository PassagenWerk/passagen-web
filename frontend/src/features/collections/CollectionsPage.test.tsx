import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Paper } from "../../api/papers";
import { CollectionsPage } from "./CollectionsPage";

function makePaper(id: string, title: string): Paper {
  return {
    id,
    title,
    abstract: null,
    cleaned_abstract: null,
    authors: [],
    year: null,
    venue: null,
    doi: null,
    arxiv_id: null,
    source_url: null,
    original_filename: `${id}.pdf`,
    status: "summarized",
    imported_at: "2026-01-01 10:00:00",
    updated_at: "2026-01-01 10:00:00",
    metadata_sources: {},
    tag_ids: [],
    collection_ids: ["col-1"],
    artifacts: { summary: true, outline: false, pdf: true },
  };
}

const collectionDetail = {
  id: "col-1",
  name: "Systems reading list",
  description: null,
  created_at: "2026-01-01 10:00:00",
  updated_at: "2026-01-01 10:00:00",
  paper_count: 2,
  papers: [
    { paper: makePaper("paper-a", "Fast Scheduler"), position: 0, note: null, added_at: "2026-01-01 10:00:00" },
    { paper: makePaper("paper-b", "Better Compiler"), position: 1, note: null, added_at: "2026-01-01 10:00:00" },
  ],
};

const collectionDocument = {
  id: "document-1",
  collection_id: "col-1",
  title: "Imported brief",
  document_type: "manual" as const,
  kind: "markdown",
  status: "ready",
  editable: true,
  source: "mcp",
  external_id: "brief-1",
  revision: 1,
  papers: [{ id: "paper-a", title: "Fast Scheduler" }],
  paper_changes: {
    added: [{ id: "paper-b", title: "Better Compiler" }],
    removed: [],
    order_changed: false,
  },
  created_at: "2026-01-02 10:00:00",
  updated_at: "2026-01-02 10:00:00",
  content_markdown: "# Imported brief\n\nInitial content.",
};

const generatedDocument = {
  ...collectionDocument,
  id: "report-1",
  title: "Generated comparison",
  document_type: "generated" as const,
  kind: "comparison",
  status: "completed",
  editable: true,
  source: "generated",
  external_id: null,
  revision: 1,
  papers: [
    { id: "paper-a", title: "Fast Scheduler" },
    { id: "paper-b", title: "Better Compiler" },
  ],
  paper_changes: { added: [], removed: [], order_changed: false },
  content_markdown: "# Generated comparison\n\nCompared results.",
};

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderPage(path = "/collections/col-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/collections/:collectionId" element={<CollectionsPage />} />
          <Route path="/collections/:collectionId/research" element={<CollectionsPage />} />
          <Route path="/collections/:collectionId/papers/:paperId" element={<CollectionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CollectionsPage research desk", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/collections") return response([{ ...collectionDetail, papers: undefined }]);
        if (url === "/api/collections/col-1") return response(collectionDetail);
        if (url === "/api/tags") return response([]);
        if (url === "/api/collections/col-1/synthesis") {
          return Promise.resolve(new Response(null, { status: 404 }));
        }
        if (url === "/api/collections/col-1/reports") return response({ items: [] });
        if (url === "/api/conversations?collection_id=col-1") return response({ items: [] });
        if (url === "/api/collections/col-1/documents" && init?.method === "POST") {
          return response({
            ...collectionDocument,
            id: "document-2",
            title: JSON.parse(String(init.body)).title,
            source: "web",
            content_markdown: "",
            paper_changes: { added: [], removed: [], order_changed: false },
          }, 201);
        }
        if (url === "/api/collections/col-1/documents") {
          return response([
            { ...collectionDocument, content_markdown: undefined },
            { ...generatedDocument, content_markdown: undefined },
          ]);
        }
        if (url === "/api/collections/col-1/documents/document-1" && init?.method === "PATCH") {
          const update = JSON.parse(String(init.body));
          return response({ ...collectionDocument, ...update, revision: 2 });
        }
        if (url === "/api/collections/col-1/documents/document-1") {
          return response(collectionDocument);
        }
        if (url === "/api/collections/col-1/documents/document-2") {
          return response({
            ...collectionDocument,
            id: "document-2",
            title: "Web working notes",
            source: "web",
            content_markdown: "",
            paper_changes: { added: [], removed: [], order_changed: false },
          });
        }
        if (url === "/api/collections/col-1/documents/report-1" && init?.method === "PATCH") {
          const update = JSON.parse(String(init.body));
          return response({ ...generatedDocument, ...update, revision: 2 });
        }
        if (url === "/api/collections/col-1/documents/report-1") {
          return response(generatedDocument);
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
  });

  afterEach(() => cleanup());

  test("keeps collection management separate from the research desk", async () => {
    const { container } = renderPage();

    expect(await screen.findByText("Fast Scheduler")).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "Collection workspace" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Open research desk" }));

    expect(await screen.findByRole("heading", { name: "Research desk" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "New Markdown" })).toHaveAttribute(
      "href",
      "/collections/col-1#collection-documents",
    );
    expect(container.querySelector(".collection-research-desk")?.className).toContain("is-motion-forward");
    expect(screen.getByRole("complementary", { name: "Collection papers" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show papers" }));
    expect(screen.getByRole("navigation").textContent).not.toContain("Collection intelligence");
    expect(screen.getByRole("link", { name: "Research desk" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide collection papers" }));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(await screen.findByText("No collection intelligence yet.")).toBeTruthy();
    expect(screen.getByText("No research documents yet.")).toBeTruthy();
    expect(await screen.findByText(/Ask across the collection/)).toBeTruthy();
  });

  test("expands Ask into the research canvas and returns to intelligence", async () => {
    const { container } = renderPage("/collections/col-1/research");

    expect(await screen.findByRole("heading", { name: "Collection intelligence" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand collection Ask" }));

    expect(screen.queryByRole("heading", { name: "Collection intelligence" })).toBeNull();
    expect(container.querySelector(".collection-research-desk")?.className).toContain("is-motion-forward");
    expect(screen.getByRole("button", { name: "Back to collection intelligence" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to collection intelligence" }));

    expect(await screen.findByRole("heading", { name: "Collection intelligence" })).toBeTruthy();
    expect(container.querySelector(".collection-research-desk")?.className).toContain("is-motion-back");
  });

  test("opens Research Documents as a URL-driven reading view", async () => {
    renderPage("/collections/col-1/research?view=document");

    expect(await screen.findByRole("button", { name: "Back to research desk" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Collection intelligence" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Collection assistant" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to research desk" }));

    expect(await screen.findByRole("heading", { name: "Collection intelligence" })).toBeTruthy();
  });

  test("opens a paper in a two-column collection reader", async () => {
    renderPage();

    const title = await screen.findByRole("link", { name: "Fast Scheduler" });
    fireEvent.doubleClick(title.closest("article")!);

    expect(await screen.findByRole("heading", { name: "Fast Scheduler", level: 1 })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Collection papers" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Better Compiler/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Systems reading list" })).toBeTruthy();
  });

  test("edits and previews an externally added Markdown document", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Imported brief", level: 3 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Document title" }), {
      target: { value: "Reviewed brief" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Document Markdown" }), {
      target: { value: "# Reviewed\n\nEdited content." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save document" }));

    expect(await screen.findByText("Saved revision 2")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/collections/col-1/documents/document-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Reviewed brief",
          content_markdown: "# Reviewed\n\nEdited content.",
          expected_revision: 1,
        }),
      }),
    );
  });

  test("adds a Web Markdown document", async () => {
    renderPage();

    fireEvent.change(await screen.findByRole("textbox", { name: "New document title" }), {
      target: { value: "Web working notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add document" }));

    expect(await screen.findByRole("heading", { name: "Web working notes", level: 3 })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/collections/col-1/documents",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Web working notes", content_markdown: "" }),
      }),
    );
  });

  test("lists generated reports with manual documents and their paper snapshot", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Generated comparison/ }));

    expect(await screen.findByRole("heading", { name: "Generated comparison", level: 3 })).toBeTruthy();
    expect(screen.getByText("2 papers at creation")).toBeTruthy();
    expect(screen.getByText("Matches current collection")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Document Markdown" }), {
      target: { value: "# Edited comparison" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save document" }));
    expect(await screen.findByText("Saved revision 2")).toBeTruthy();
  });
});
