import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { App } from "../App";

const paper = {
  id: "paper-1",
  title: "A Useful Paper",
  abstract: "An author-written overview of this research.",
  cleaned_abstract: "A cleaned author-written overview of this research.",
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

let tagFixtures: Array<{
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  paper_count: number;
}>;
let processingRuns: unknown[];

beforeEach(() => {
  processingRuns = [];
  tagFixtures = [
    { id: "tag-1", name: "Systems", color: "#395b64", created_at: "2026-01-01", paper_count: 1 },
    { id: "tag-2", name: "Priority", color: "#6b705c", created_at: "2026-01-02", paper_count: 0 },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/health") return response({ status: "ok", database: "available" });
      if (url === "/api/processing-runs?limit=50") return response({ items: processingRuns });
      if (url === "/api/conversations?paper_id=paper-1") return response({ items: [] });
      if (url.startsWith("/api/qa-records?")) return response({ items: [] });
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
        const body = JSON.parse(String(init.body)) as { name: string; color?: string };
        const created = {
          id: `tag-${tagFixtures.length + 1}`,
          name: body.name,
          color: body.color ?? null,
          created_at: "2026-01-03",
          paper_count: 0,
        };
        tagFixtures.push(created);
        return response(created);
      }
      if (url === "/api/tags") {
        return response(tagFixtures);
      }
      const tagMatch = /^\/api\/tags\/([\w-]+)$/.exec(url);
      if (tagMatch && init?.method === "PATCH") {
        const tag = tagFixtures.find((item) => item.id === tagMatch[1]);
        if (!tag) return Promise.resolve(new Response(null, { status: 404 }));
        Object.assign(tag, JSON.parse(String(init.body)) as { name?: string; color?: string });
        return response(tag);
      }
      if (tagMatch && init?.method === "DELETE") {
        tagFixtures = tagFixtures.filter((item) => item.id !== tagMatch[1]);
        return Promise.resolve(new Response(null, { status: 204 }));
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
      if (url.endsWith("/note") && init?.method === "PUT") {
        return response({ paper_id: "paper-1", content: JSON.parse(String(init.body)).content });
      }
      if (url.endsWith("/note")) {
        return response({ paper_id: "paper-1", content: "# Personal note\n\nWorth revisiting." });
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
      if (url === "/api/papers/paper-1/tags/tag-1" && init?.method === "DELETE") {
        return response({ ...paper, tag_ids: [] });
      }
      if (url === "/api/papers/paper-1/tags/tag-1" && init?.method === "PUT") {
        return response(paper);
      }
      if (url === "/api/papers/paper-1/tags/tag-3" && init?.method === "PUT") {
        return response({ ...paper, tag_ids: ["tag-1", "tag-3"] });
      }
      if (url === "/api/papers/paper-1") return response(paper);
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.readerScale;
  document.documentElement.style.removeProperty("--reader-font-size");
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
  expect(await screen.findByRole("link", { name: "Processing idle" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "A Useful Paper" })).toBeInTheDocument();
  expect(screen.getAllByText("Systems")).toHaveLength(1);

  fireEvent.change(screen.getByRole("searchbox", { name: "Search title" }), {
    target: { value: "kernel" },
  });

  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("q=kernel"));
  });
});

test("shows an active processing run in the masthead", async () => {
  processingRuns = [{ status: "running" }];
  renderApp();

  expect(await screen.findByRole("link", { name: "Processing active" })).toHaveClass("is-active");
});

test("changes and persists the color theme", async () => {
  renderApp();

  fireEvent.click(screen.getByRole("button", { name: "Mode" }));
  fireEvent.click(screen.getByRole("radio", { name: "dark" }));

  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
  expect(window.localStorage.getItem("passagen.theme")).toBe("dark");
  expect(screen.queryByRole("radio", { name: "dark" })).not.toBeInTheDocument();
});

test("changes and persists the reading text size", async () => {
  renderApp("/papers/paper-1");
  await screen.findByText("A useful research problem");

  expect(screen.getAllByRole("button", { name: "Text size" })).toHaveLength(1);
  expect(screen.queryByRole("slider", { name: "Global font size" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Text size" }));
  fireEvent.change(screen.getByRole("slider", { name: "Global font size" }), {
    target: { value: "21" },
  });

  await waitFor(() => expect(document.documentElement.style.getPropertyValue("--reader-font-size")).toBe("21px"));
  expect(document.documentElement).toHaveAttribute("data-reader-scale", "large");
  expect(window.localStorage.getItem("passagen.reader-font-size")).toBe("21");
  expect(screen.getByText("21px")).toBeInTheDocument();
});

test("opens a paper summary and supports keyboard navigation", async () => {
  renderApp();
  await screen.findByRole("heading", { name: "A Useful Paper" });

  fireEvent.keyDown(window, { key: "j" });

  expect(await screen.findByText("A useful research problem")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Author abstract" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reprocess from Metadata" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reprocess from Summary" })).toBeInTheDocument();
  const abstract = screen.getByRole("region", { name: "Author abstract" });
  const abstractReset = within(abstract).getByRole("button", {
    name: "Reprocess from Abstract clean",
  });
  fireEvent.click(abstractReset);
  const abstractDialog = within(abstract).getByRole("dialog", {
    name: "Reprocess from Abstract clean",
  });
  expect(abstractDialog).toHaveTextContent("The cleaned Abstract view will be regenerated");
  expect(abstractDialog).toHaveTextContent("Summary and Outline remain unchanged");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(within(abstract).getByRole("button", { name: "Cleaned" })).toHaveAttribute("aria-pressed", "true");
  expect(within(abstract).getByText("A cleaned author-written overview of this research.")).toBeVisible();
  expect(within(abstract).queryByText("An author-written overview of this research.")).not.toBeInTheDocument();
  fireEvent.click(within(abstract).getByRole("button", { name: "Original" }));
  expect(within(abstract).getByText("An author-written overview of this research.")).toBeVisible();
  expect(within(abstract).queryByText("A cleaned author-written overview of this research.")).not.toBeInTheDocument();
  fireEvent.click(within(abstract).getByRole("button", { name: "Collapse" }));
  expect(within(abstract).getByText("An author-written overview of this research.")).not.toBeVisible();
  expect(screen.getByRole("button", { name: "Expand" })).toHaveAttribute("aria-expanded", "false");
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

test("edits, previews, and saves a Markdown paper note", async () => {
  renderApp("/papers/paper-1");
  fireEvent.click(await screen.findByRole("tab", { name: "Note" }));

  expect(await screen.findByRole("heading", { name: "Personal note" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const editor = screen.getByRole("textbox", { name: "Note Markdown" });
  expect(editor).toHaveValue("# Personal note\n\nWorth revisiting.");
  fireEvent.change(editor, { target: { value: "# Follow up\n\nCheck experiment." } });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(await screen.findByRole("heading", { name: "Follow up" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
    "/api/papers/paper-1/note",
    expect.objectContaining({ method: "PUT" }),
  ));
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

test("opens the paper PDF from the main reader toolbar", async () => {
  const { container } = renderApp("/papers/paper-1");
  await screen.findByText("A useful research problem");

  fireEvent.click(screen.getByRole("button", { name: "Open paper PDF" }));

  expect(await screen.findByTitle("A Useful Paper PDF")).toBeInTheDocument();
  expect(container.querySelector(".library-grid")).toHaveClass("is-focus");
  expect(container.querySelector(".detail-panel")).toHaveClass("has-pdf", "has-companion");
  expect(screen.getByRole("button", { name: "Close paper PDF" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("pushes Ask beside reading and shifts it left when PDF opens", async () => {
  const { container } = renderApp("/papers/paper-1");
  await screen.findByText("A useful research problem");

  fireEvent.click(screen.getByRole("button", { name: "Ask" }));

  expect(container.querySelector(".library-grid")).toHaveClass("is-focus");
  expect(container.querySelector(".detail-panel")).toHaveClass("has-ask", "has-companion");
  expect(screen.getByText("A useful research problem")).toBeInTheDocument();
  expect(screen.getByLabelText("Paper assistant")).toHaveAttribute("aria-hidden", "false");
  expect(screen.getByText("New conversation")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Open PDF panel" }));

  expect(await screen.findByTitle("A Useful Paper PDF")).toBeInTheDocument();
  expect(container.querySelector(".detail-panel")).toHaveClass("is-ask-primary", "has-pdf");

  fireEvent.click(screen.getByRole("button", { name: "Paper only" }));
  expect(container.querySelector(".detail-panel")).not.toHaveClass(
    "is-ask-primary",
    "has-pdf",
    "has-ask",
    "has-companion",
  );
  expect(screen.queryByTitle("A Useful Paper PDF")).not.toBeInTheDocument();
  expect(container.querySelector(".library-grid")).toHaveClass("is-focus");
  expect(screen.getByText("A useful research problem")).toBeInTheDocument();
});

test("opens evidence pages in the PDF reader", async () => {
  renderApp("/papers/paper-1");

  const evidence = await screen.findByRole("link", { name: "12" });
  expect(evidence).toHaveClass("evidence-page-link");
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
  expect(evidence).toHaveClass("evidence-page-link");
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
  fireEvent.click(screen.getByRole("button", { name: "Tags 1" }));
  expect(screen.getByText("Personal labels; separate from generated Paper Keywords.")).toBeInTheDocument();
});

test("assigns and removes Library Tags from the reading toolbar", async () => {
  renderApp("/papers/paper-1");
  await screen.findByText("A useful research problem");

  fireEvent.click(screen.getByRole("button", { name: "Tags 1" }));
  const picker = screen.getByRole("listbox", { name: "Tags" });
  const option = within(picker).getByRole("option", { name: /Systems/ });
  expect(option).toHaveAttribute("aria-selected", "true");
  fireEvent.click(option);
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/papers/paper-1/tags/tag-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  expect(within(picker).getByRole("option", { name: /Systems/ })).toHaveAttribute("aria-selected", "false");

  fireEvent.click(within(picker).getByRole("option", { name: /Systems/ }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/papers/paper-1/tags/tag-1",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

test("creates and assigns a new tag from the reading toolbar", async () => {
  renderApp("/papers/paper-1");
  await screen.findByText("A useful research problem");

  fireEvent.click(screen.getByRole("button", { name: "Tags 1" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tags" }), {
    target: { value: "Methods" },
  });
  fireEvent.click(screen.getByRole("button", { name: 'Create and assign "Methods"' }));

  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/tags",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Methods", color: "#6b705c" }) }),
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/papers/paper-1/tags/tag-3",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

test("filters the library by multiple tags through the picker and URL", async () => {
  renderApp();
  await screen.findByRole("heading", { name: "A Useful Paper" });

  fireEvent.click(screen.getByRole("button", { name: /All tags/ }));
  fireEvent.click(screen.getByRole("option", { name: /Systems/ }));
  fireEvent.click(screen.getByRole("option", { name: /Priority/ }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("tag=tag-1&tag=tag-2"));
  });
  expect(screen.getByRole("button", { name: /Systems/ })).toHaveAttribute("aria-expanded", "true");

  fireEvent.click(screen.getByRole("radio", { name: "Any selected tag" }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("tag_match=any"));
  });

  fireEvent.click(screen.getByRole("button", { name: "Clear tags" }));
  await waitFor(() => {
    const papersCalls = vi.mocked(fetch).mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.startsWith("/api/papers?"));
    expect(papersCalls.at(-1)).toBe("/api/papers?");
  });
});

test("restores a multi-tag filter from the URL", async () => {
  renderApp("/?tag=tag-1&tag=tag-2&tag_match=any");

  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("tag_match=any"));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("tag=tag-1&tag=tag-2"));
  });
  expect(await screen.findByRole("button", { name: /Systems/ })).toBeInTheDocument();
});

test("manages Library Tags from the tags workspace", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  renderApp("/tags");

  expect(await screen.findByRole("link", { name: /Systems/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Priority/ })).toBeInTheDocument();

  fireEvent.change(screen.getByRole("searchbox", { name: "Search Library Tags" }), {
    target: { value: "prio" },
  });
  expect(screen.queryByRole("link", { name: /Systems/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Priority/ })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search Library Tags" }), {
    target: { value: "" },
  });

  fireEvent.click(screen.getByRole("link", { name: /Systems/ }));
  expect(await screen.findByRole("heading", { name: "Systems" })).toBeInTheDocument();
  expect(screen.getByText("Library Tag / 1 paper")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Systems v2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save tag" }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/tags/tag-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Systems v2", color: "#395b64" }),
      }),
    );
  });

  fireEvent.click(screen.getByRole("button", { name: "Delete tag" }));
  expect(confirm).toHaveBeenCalledWith(
    'Delete Library Tag "Systems v2"? It will be removed from 1 paper.',
  );
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/tags/tag-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  confirm.mockRestore();
});

test("creates a Library Tag from the tags workspace", async () => {
  renderApp("/tags");
  await screen.findByRole("link", { name: /Systems/ });

  fireEvent.change(screen.getByRole("textbox", { name: "New Library Tag" }), {
    target: { value: "Methods" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/tags",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Methods", color: "#6b705c" }),
      }),
    );
  });
  expect(await screen.findByRole("heading", { name: "Methods" })).toBeInTheDocument();
});

test("saves user metadata from the paper header", async () => {
  renderApp("/papers/paper-1");
  await screen.findByText("A useful research problem");

  fireEvent.click(screen.getByText("Edit Metadata"));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Edit paper metadata" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit Metadata" })).toHaveFocus();
  fireEvent.click(screen.getByText("Edit Metadata"));
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "A User Title" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/papers/paper-1/metadata",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
  expect(screen.queryByRole("dialog", { name: "Edit paper metadata" })).not.toBeInTheDocument();
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

  const checkbox = await screen.findByRole("checkbox", { name: "Select A Useful Paper" });
  fireEvent.click(screen.getByRole("link", { name: /A Useful Paper/ }));

  expect(await screen.findByRole("heading", { name: "A Useful Paper", level: 1 })).toBeInTheDocument();
  expect(checkbox).not.toBeChecked();

  fireEvent.click(checkbox);
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
