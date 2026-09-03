import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { App } from "../App";

const paper = {
  id: "paper-1",
  title: "A Useful Paper",
  authors: ["Ada Author", "Ben Builder"],
  year: 2024,
  venue: "SOSP",
  doi: null,
  arxiv_id: null,
  source_url: null,
  original_filename: "paper.pdf",
  status: "outlined",
  imported_at: "2026-01-01 10:00:00",
  updated_at: "2026-01-01 10:00:00",
  metadata_sources: {},
  tag_ids: ["tag-1"],
  artifacts: { summary: true, outline: true, pdf: false },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/health") return response({ status: "ok", database: "available" });
      if (url === "/api/tags") {
        return response([
          { id: "tag-1", name: "Systems", color: "#395b64", created_at: "2026-01-01" },
        ]);
      }
      if (url.endsWith("/summary")) {
        return response({
          paper_id: "paper-1",
          content: {
            schema_version: "2",
            problem: { problem_statement: "A useful research problem" },
          },
        });
      }
      if (url.endsWith("/outline")) {
        return response({
          paper_id: "paper-1",
          content: "# Technical outline\n\n<script>unsafe()</script>",
        });
      }
      if (url.startsWith("/api/papers?")) {
        return response({ items: [paper], total: 1, limit: 50, offset: 0 });
      }
      if (url === "/api/papers/paper-1") return response(paper);
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function response(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}

function renderApp(entry = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("loads the connected paper library and updates search through the URL", async () => {
  renderApp();

  expect(await screen.findByText("Library online")).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "A Useful Paper" })).toBeInTheDocument();
  expect(screen.getAllByText("Systems")).toHaveLength(2);

  fireEvent.change(screen.getByRole("searchbox", { name: "Search title" }), {
    target: { value: "kernel" },
  });

  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("q=kernel"));
  });
});

test("opens a paper summary and supports keyboard navigation", async () => {
  renderApp();
  await screen.findByRole("heading", { name: "A Useful Paper" });

  fireEvent.keyDown(window, { key: "j" });

  expect(await screen.findByText("A useful research problem")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
});

test("renders Markdown outline without executing raw HTML", async () => {
  renderApp("/papers/paper-1?view=outline");

  expect(await screen.findByRole("heading", { name: "Technical outline" })).toBeInTheDocument();
  expect(document.querySelector("script")).not.toBeInTheDocument();
  expect(screen.queryByText("unsafe()")).not.toBeInTheDocument();
});

test("double-click focuses reading and the back control restores three columns", async () => {
  const { container } = renderApp();
  const paperLink = await screen.findByTitle("Double-click to focus reading");

  fireEvent.doubleClick(paperLink);
  await screen.findByText("A useful research problem");
  expect(container.querySelector(".library-grid")).toHaveClass("is-focus");
  fireEvent.click(screen.getByRole("button", { name: "Back to three columns" }));
  expect(container.querySelector(".library-grid")).not.toHaveClass("is-focus");
});
