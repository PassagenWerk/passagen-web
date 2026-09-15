import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { PaperCitation } from "./PaperCitation";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("retrieves, identifies, and copies a BibTeX citation", async () => {
  const content = "@article{author2025, title={A Paper}}\n";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    paper_id: "paper-a",
    format: "bibtex",
    content,
    source: "doi",
    authoritative: true,
    warnings: [],
    cached: false,
    updated_at: "2026-09-15T08:00:00Z",
    remote_checked_at: "2026-09-15T08:00:00Z",
  }), { status: 200, headers: { "Content-Type": "application/json" } })));
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <PaperCitation paperId="paper-a" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Cite" }));

  expect(await screen.findByText("DOI metadata / authoritative")).toBeInTheDocument();
  expect(screen.getByText(/Saved/)).toBeInTheDocument();
  expect(screen.getByText(content.trim())).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Copy BibTeX" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(content));
  expect(screen.getByText("Copied.")).toBeInTheDocument();
});

test("refreshes a saved citation without discarding the current content", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      paper_id: "paper-a",
      format: "bibtex",
      content: "@misc{saved, title={Saved}}\n",
      source: "local_metadata",
      authoritative: false,
      warnings: [],
      cached: true,
      updated_at: "2026-09-15T08:00:00Z",
      remote_checked_at: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      paper_id: "paper-a",
      format: "bibtex",
      content: "@article{refreshed, title={Refreshed}}\n",
      source: "doi",
      authoritative: true,
      warnings: [],
      cached: false,
      updated_at: "2026-09-15T09:00:00Z",
      remote_checked_at: "2026-09-15T09:00:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PaperCitation paperId="paper-a" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Cite" }));
  expect(await screen.findByText("@misc{saved, title={Saved}}")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Refresh citation" }));

  expect(await screen.findByText("@article{refreshed, title={Refreshed}}")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/papers/paper-a/citation/refresh?format=bibtex",
    { method: "POST" },
  );
});
