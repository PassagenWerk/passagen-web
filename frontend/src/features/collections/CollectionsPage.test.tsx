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

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/collections/col-1"]}>
        <Routes>
          <Route path="/collections/:collectionId" element={<CollectionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CollectionsPage workspace tabs", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/collections") return response([{ ...collectionDetail, papers: undefined }]);
        if (url === "/api/collections/col-1") return response(collectionDetail);
        if (url === "/api/tags") return response([]);
        if (url === "/api/collections/col-1/synthesis") {
          return Promise.resolve(new Response(null, { status: 404 }));
        }
        if (url === "/api/collections/col-1/reports") return response({ items: [] });
        if (url === "/api/conversations?collection_id=col-1") return response({ items: [] });
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
  });

  afterEach(() => cleanup());

  test("keeps Papers as the default tab and switches workspace tabs", async () => {
    renderPage();

    expect(await screen.findByText("Fast Scheduler")).toBeTruthy();
    const tablist = screen.getByRole("tablist", { name: "Collection workspace" });
    expect(tablist).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Papers" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Synthesis" }));
    expect(await screen.findByText("No synthesis yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Reports" }));
    expect(await screen.findByText("No reports yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Ask" }));
    expect(await screen.findByText(/Ask across the collection/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Papers" }));
    expect(await screen.findByText("Better Compiler")).toBeTruthy();
  });
});
