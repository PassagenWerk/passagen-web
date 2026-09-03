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
  artifacts: { summary: true, outline: true, pdf: true },
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
            contributions: [{ statement: "A useful contribution", evidence_pages: [12, 19] }],
          },
        });
      }
      if (url.endsWith("/outline")) {
        return response({
          paper_id: "paper-1",
          content: "# Technical outline\n\n- Evidence pages: 7, 8\n\n<script>unsafe()</script>",
        });
      }
      if (url.endsWith("/pdf")) {
        return Promise.resolve(
          new Response(new Uint8Array([37]), {
            status: 206,
            headers: { "Content-Type": "application/pdf" },
          }),
        );
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
  expect(screen.queryByRole("button", { name: "Open PDF panel" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("PDF reader")).not.toBeInTheDocument();
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

test("opens and closes PDF beside the focused summary", async () => {
  const { container } = renderApp();
  fireEvent.doubleClick(await screen.findByTitle("Double-click to focus reading"));

  fireEvent.click(await screen.findByRole("button", { name: "Open PDF panel" }));
  expect(await screen.findByTitle("A Useful Paper PDF")).toBeInTheDocument();
  expect(screen.getByText("A useful research problem")).toBeInTheDocument();
  expect(container.querySelector(".detail-panel")).toHaveClass("has-pdf");

  fireEvent.click(screen.getByRole("button", { name: "Close PDF panel" }));
  expect(screen.getByLabelText("PDF reader")).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByTitle("A Useful Paper PDF")).not.toBeInTheDocument();
  expect(container.querySelector(".detail-panel")).not.toHaveClass("has-pdf");
  expect(container.querySelector(".library-grid")).toHaveClass("is-focus");
});

test("opens evidence pages in the PDF reader", async () => {
  renderApp("/papers/paper-1");

  const evidence = await screen.findByRole("link", { name: "12" });
  fireEvent.click(evidence);

  const reader = await screen.findByTitle("A Useful Paper PDF");
  expect(reader).toHaveAttribute("src", "/api/papers/paper-1/pdf#page=12&view=FitH");
  expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Close PDF panel" })).toHaveAttribute("aria-pressed", "true");
  expect(document.querySelector(".library-grid")).toHaveClass("is-focus");
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(
    "/api/papers/paper-1/pdf",
    { headers: { Range: "bytes=0-0" } },
  );

  fireEvent.click(screen.getByRole("link", { name: "19" }));
  expect(await screen.findByTitle("A Useful Paper PDF")).toHaveAttribute(
    "src",
    "/api/papers/paper-1/pdf#page=19&view=FitH",
  );
});

test("links outline evidence pages to the same paper PDF", async () => {
  renderApp("/papers/paper-1?view=outline");

  const evidence = await screen.findByRole("link", { name: "7" });
  expect(evidence).toHaveAttribute(
    "href",
    "/papers/paper-1/pdf?view=outline&page=7",
  );
  expect(screen.getByRole("link", { name: "8" })).toHaveAttribute(
    "href",
    "/papers/paper-1/pdf?view=outline&page=8",
  );
  fireEvent.click(evidence);
  expect(await screen.findByTitle("A Useful Paper PDF")).toHaveAttribute(
    "src",
    "/api/papers/paper-1/pdf#page=7&view=FitH",
  );
  expect(screen.getByRole("tab", { name: "Outline" })).toHaveAttribute("aria-selected", "true");
});
