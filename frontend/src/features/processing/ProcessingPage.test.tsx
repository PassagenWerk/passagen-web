import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { App } from "../../App";
import { PaperProcessing } from "../papers/PaperProcessing";

const pendingPaper = {
  id: "paper-1",
  title: "An Unprocessed Paper",
  abstract: null,
  cleaned_abstract: null,
  authors: ["Ada Author"],
  year: 2024,
  venue: null,
  doi: null,
  arxiv_id: null,
  source_url: null,
  original_filename: "paper.pdf",
  status: "discovered",
  imported_at: "2026-01-01 10:00:00",
  updated_at: "2026-01-01 10:00:00",
  metadata_sources: {},
  tag_ids: [],
  artifacts: { summary: false, outline: false, pdf: true },
};

const completedRun = {
  id: "run-1",
  paper_ids: ["paper-1"],
  mode: "continue",
  from_stage: null,
  status: "completed",
  current_paper_id: null,
  current_stage: null,
  created_at: "2026-01-01 10:00:00",
  finished_at: "2026-01-01 10:05:00",
  error: null,
  result: {
    updated: ["paper-1"],
    skipped: [],
    failed: [],
    warnings: [],
  },
};

const failedRun = {
  ...completedRun,
  id: "run-old",
  created_at: "2026-01-01 09:00:00",
  finished_at: "2026-01-01 09:05:00",
  result: {
    updated: [],
    skipped: [],
    failed: [
      {
        paper_id: "paper-1",
        category: "summarization",
        message: "Unauthorized",
      },
    ],
    warnings: [],
  },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/health") return response({ status: "ok", database: "available" });
      if (url === "/api/collections") return response([]);
      if (url === "/api/tags") return response([]);
      if (url.startsWith("/api/papers?")) {
        return response({ items: [pendingPaper], total: 1, limit: 200, offset: 0 });
      }
      if (url === "/api/papers/import" && init?.method === "POST") {
        return response({ added: ["paper-9"], duplicates: [], failed: [] });
      }
      if (url === "/api/processing-runs" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { paper_ids: string[] };
        return response({ ...completedRun, id: "run-2", status: "queued", paper_ids: body.paper_ids });
      }
      if (url.startsWith("/api/processing-runs?")) return response({ items: [completedRun] });
      if (url === "/api/processing-runs/run-1/events") {
        return response({
          items: [
            {
              sequence: 1,
              run_id: "run-1",
              paper_id: "paper-1",
              stage: "summary",
              current: 1,
              total: 1,
              message: "Paper 1/1 [stage 3/4: summary]: done.",
            },
          ],
        });
      }
      if (url === "/api/processing-runs/run-1") return response(completedRun);
      if (url === "/api/papers/paper-1") return response(pendingPaper);
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
});

afterEach(() => {
  cleanup();
});

function response(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderApp(entry = "/processing") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("processing workspace lists pending papers and recent runs", async () => {
  renderApp();

  expect(await screen.findByRole("heading", { name: "Pending papers" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Reprocessing stages" })).toBeInTheDocument();
  expect(screen.getByText("Extract structured text from the PDF.")).toBeInTheDocument();
  expect(screen.getByText(/Outline only keeps all earlier artifacts/)).toBeInTheDocument();
  expect(screen.getByText(/manually edited library metadata are preserved/)).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "An Unprocessed Paper" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: /Run run-1/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Process pending papers" }));
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/processing-runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ paper_ids: ["paper-1"], mode: "continue", from_stage: null }),
      }),
    );
  });
});

test("uploads PDF files and reports the import summary", async () => {
  renderApp();
  await screen.findByRole("heading", { name: "Import PDFs" });

  const input = screen.getByLabelText("PDF files to import");
  fireEvent.change(input, {
    target: { files: [new File(["%PDF-1.7 %%EOF"], "new.pdf", { type: "application/pdf" })] },
  });

  expect(await screen.findByText("Imported: 1 new paper(s).")).toBeInTheDocument();
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(
    "/api/papers/import",
    expect.objectContaining({ method: "POST" }),
  );
});

test("run detail shows status, result, and progress events", async () => {
  renderApp("/processing/runs/run-1");

  expect(await screen.findByRole("heading", { name: /Run run-1/ })).toBeInTheDocument();
  expect(screen.getByText("1 updated, 0 skipped, 0 failed")).toBeInTheDocument();
  expect(await screen.findByText("Paper 1/1 [stage 3/4: summary]: done.")).toBeInTheDocument();
});

test("paper page offers to process an unfinished paper", async () => {
  renderApp("/papers/paper-1");

  const button = await screen.findByRole("button", { name: "Process" });
  fireEvent.click(button);
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/processing-runs",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

test("paper status ignores an older failure after the latest run succeeds", async () => {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/processing-runs?")) {
      return response({ items: [completedRun, failedRun] });
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PaperProcessing paper={{ ...pendingPaper, status: "outlined" }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await waitFor(() => {
    expect(queryClient.getQueryData(["paper-runs", "paper-1"])).toEqual([
      completedRun,
      failedRun,
    ]);
  });
  expect(screen.queryByText(/Last run failed/)).not.toBeInTheDocument();
});

test("paper page hides rebuild controls until requested and supports outline only", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PaperProcessing paper={{ ...pendingPaper, status: "outlined" }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.queryByRole("dialog", { name: "Reprocess paper" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reprocess" }));
  expect(screen.getByRole("dialog", { name: "Reprocess paper" })).toBeInTheDocument();

  fireEvent.change(screen.getByRole("combobox", { name: "Stages to rebuild" }), {
    target: { value: "outline" },
  });
  expect(screen.getByRole("option", { name: "Summary + Outline" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Outline only" })).toBeInTheDocument();
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Reprocess paper" })).getByRole("button", {
      name: "Reprocess",
    }),
  );

  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/processing-runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          paper_ids: ["paper-1"],
          mode: "rebuild",
          from_stage: "outline",
        }),
      }),
    );
  });
});
