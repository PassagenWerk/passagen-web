import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { Paper } from "../../api/papers";
import { PaperLibraryEditor } from "./PaperLibraryEditor";

const paper: Paper = {
  id: "paper-a",
  title: "Alpha System",
  abstract: null,
  cleaned_abstract: null,
  authors: [],
  year: 2024,
  venue: "SOSP",
  doi: null,
  arxiv_id: null,
  source_url: null,
  original_filename: "alpha.pdf",
  status: "discovered",
  imported_at: "2026-01-01",
  updated_at: "2026-01-01",
  metadata_sources: {},
  tag_ids: [],
  collection_ids: [],
  artifacts: { summary: false, outline: false, pdf: true },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("deletes a paper only after destructive confirmation", async () => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onDeleted = vi.fn(async () => undefined);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const fetch = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);

  render(
    <QueryClientProvider client={queryClient}>
      <PaperLibraryEditor paper={paper} onDeleted={onDeleted} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit Metadata" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete paper" }));

  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(confirm).toHaveBeenCalledWith(
    'Delete paper "Alpha System"? This cannot be undone.',
  );
  expect(fetch).toHaveBeenCalledWith("/api/papers/paper-a", { method: "DELETE" });
});
