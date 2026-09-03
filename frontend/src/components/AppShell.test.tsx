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

const secondPaper = {
  ...paper,
  id: "paper-2",
  title: "A Second Paper",
  original_filename: "second.pdf",
  tag_ids: [],
};

const collection = {
  id: "collection-1",
  name: "Database Survey",
  description: "Core reading",
  created_at: "2026-01-01 10:00:00",
  updated_at: "2026-01-01 10:00:00",
  paper_count: 2,
  papers: [paper, secondPaper].map((item, position) => ({
    paper: item,
    position,
    note: null,
    added_at: "2026-01-01 10:00:00",
  })),
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/health") return response({ status: "ok", database: "available" });
      if (url === "/api/collections" && init?.method === "POST") return response(collection);
      if (url === "/api/collections") {
        return response([{
          id: collection.id,
          name: collection.name,
          description: collection.description,
          created_at: collection.created_at,
          updated_at: collection.updated_at,
          paper_count: collection.paper_count,
        }]);
      }
      if (url === "/api/collections/collection-1/papers/order" && init?.method === "PATCH") {
        return response({ ...collection, papers: [...collection.papers].reverse() });
      }
      if (url === "/api/collections/collection-1/papers" && init?.method === "POST") {
        return response(collection);
      }
      if (url === "/api/collections/collection-1" && init?.method === "PATCH") {
        return response(collection);
      }
      if (url === "/api/collections/collection-1") return response(collection);
      if (url === "/api/tags" && init?.method === "POST") {
        return response({ id: "tag-2", name: "Priority", color: "#6b705c", created_at: "2026-01-02" });
      }
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
            classification: { keywords: ["generated-keyword"] },
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
      if (url.endsWith("/metadata") && init?.method === "PATCH") {
        const update = JSON.parse(String(init.body)) as Partial<typeof paper>;
        return response({
          ...paper,
          ...update,
          updated_at: "2026-01-02 10:00:00",
          metadata_sources: { title: "user" },
        });
      }
      if (url.endsWith("/tags") && init?.method === "PUT") {
        return response({ ...paper, tag_ids: [] });
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

test("keeps generated keywords distinct from editable Library Tags", async () => {
  renderApp("/papers/paper-1");

  expect(await screen.findByText("Paper keywords (generated)")).toBeInTheDocument();
  expect(screen.getByText("generated-keyword")).toBeInTheDocument();
  expect(screen.getByText("Personal labels; separate from read-only Paper Keywords.")).toBeInTheDocument();
});

test("creates a Library Tag and saves user metadata", async () => {
  renderApp("/papers/paper-1");
  await screen.findByText("A useful research problem");

  fireEvent.click(screen.getByText("Manage Library Tags"));
  fireEvent.change(screen.getByRole("textbox", { name: "New Library Tag" }), {
    target: { value: "Priority" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/tags",
      expect.objectContaining({ method: "POST" }),
    );
  });

  fireEvent.click(screen.getByText("Edit Library Data"));
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "A User Title" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(
    "/api/papers/paper-1/metadata",
    expect.objectContaining({ method: "PATCH" }),
  );

  fireEvent.click(screen.getByRole("checkbox", { name: /Systems/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/papers/paper-1/tags",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

test("browses all, collection, and unfiled papers from the Library", async () => {
  renderApp("/?collection=collection-1");
  await screen.findByRole("option", { name: "Database Survey" });
  const browse = screen.getByRole("combobox", { name: "Collection" });

  expect(browse).toHaveValue("collection-1");
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("collection=collection-1"));
  });

  cleanup();
  renderApp("/?unfiled=true");
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("unfiled=true"));
  });
});

test("selects filtered Library papers and adds them to a collection", async () => {
  renderApp("/?addToCollection=collection-1");

  fireEvent.click(await screen.findByRole("checkbox", { name: "Select A Useful Paper" }));
  fireEvent.click(screen.getByRole("button", { name: "Add selected papers" }));

  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/collections/collection-1/papers",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ paper_ids: ["paper-1"] }) }),
    );
  });
  expect(await screen.findByRole("link", { name: "View collection" })).toHaveAttribute(
    "href",
    "/collections/collection-1",
  );
});

test("manages ordered collection members and opens collection-context reading", async () => {
  renderApp("/collections/collection-1");

  expect(await screen.findByRole("heading", { name: "Database Survey" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Add papers" })).toHaveAttribute(
    "href",
    "/?addToCollection=collection-1",
  );
  fireEvent.click(screen.getByRole("button", { name: "Move A Useful Paper down" }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/collections/collection-1/papers/order",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ paper_ids: ["paper-2", "paper-1"] }),
      }),
    );
  });

  fireEvent.click(screen.getByRole("link", { name: "A Useful Paper" }));
  expect(await screen.findByRole("link", { name: "Back to Database Survey" })).toBeInTheDocument();
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
    "href",
    "/collections/collection-1/papers/paper-2",
  );
});
