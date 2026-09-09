import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ReportsPanel } from "./ReportsPanel";
import { SynthesisPanel } from "./SynthesisPanel";

const papers = [
  { id: "paper-a", title: "Fast Scheduler" },
  { id: "paper-b", title: "Better Compiler" },
  { id: "paper-c", title: "Graph Partitioner" },
];

const citation = {
  citation_id: "c-1",
  paper_id: "paper-a",
  artifact_kind: "summary_json",
  summary_path: "identity.title",
  section: null,
  page_start: 5,
  page_end: null,
  excerpt: null,
};

const synthesisResult = {
  synthesis: {
    schema_version: "2",
    executive_overview: "The collection studies systems.",
    paper_roles: [
      {
        paper_id: "paper-a",
        role: "Systems evidence",
        contribution: "Contributes the scheduler design.",
        method: "Prototype evaluation",
        citation_ids: ["c-1"],
      },
    ],
    themes: [
      {
        name: "Systems",
        description: "The papers study systems.",
        paper_ids: ["paper-a"],
        citation_ids: ["c-1"],
      },
    ],
    comparison_matrix: { dimensions: [], rows: [] },
    agreements: [],
    disagreements: [],
    complementary_contributions: [],
    gaps: [],
    open_questions: [
      {
        question: "How do the systems compare?",
        rationale: "A shared workload would clarify the difference.",
        paper_ids: ["paper-a"],
        citation_ids: ["c-1"],
      },
    ],
    claims: [{ text: "The collection covers systems.", citation_ids: ["c-1"] }],
    citations: [citation],
    coverage: {
      included_paper_ids: ["paper-a", "paper-b"],
      missing_summary_paper_ids: ["paper-c"],
      partial: true,
    },
  },
  run_id: "run-syn",
  artifacts: [],
  source_status: { stale: true, reasons: ["summary_content_changed"] },
  disposition: "generated",
  strategy: "direct",
};

const reportView = {
  record: {
    id: "report-1",
    collection_id: "col-1",
    kind: "review",
    status: "completed",
    title: "Literature review: Systems reading list",
    user_prompt: null,
    source_snapshot_json: "{}",
    source_fingerprint: "f".repeat(64),
    run_id: "run-rep",
    report_artifact_id: "art-1",
    error: null,
    created_at: "2026-01-02 10:00:00",
    completed_at: "2026-01-02 10:01:00",
  },
  report: {
    schema_version: "1",
    kind: "review",
    title: "Literature review: Systems reading list",
    user_prompt: null,
    synthesis_artifact_id: null,
    coverage: {
      included_paper_ids: ["paper-a", "paper-b", "paper-c"],
      missing_summary_paper_ids: [],
      partial: false,
    },
    sections: [
      {
        heading: "Overview",
        body_markdown: "The papers study systems [c-1].",
        claims: [{ text: "The papers study systems.", citation_ids: ["c-1"] }],
      },
    ],
    claims: [{ text: "The collection covers systems.", citation_ids: ["c-1"] }],
    citations: [citation],
  },
  artifacts: [],
  source_status: { stale: false, reasons: [] },
};

const queuedReportView = {
  ...reportView,
  record: { ...reportView.record, id: "report-2", status: "queued", title: "Comparison" },
  report: null,
};

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderPanel(panel: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{panel}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SynthesisPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/collections/col-1/synthesis" && init?.method === "POST") {
          return response({ run_id: "run-syn", result: null }, 202);
        }
        if (url === "/api/collections/col-1/synthesis") {
          return response(synthesisResult);
        }
        if (url === "/api/generation-runs/run-syn") {
          return response({
            id: "run-syn",
            kind: "collection_synthesis",
            status: "completed",
            error_code: null,
            error_message: null,
            created_at: "2026-01-02 10:00:00",
            started_at: "2026-01-02 10:00:01",
            completed_at: "2026-01-02 10:00:02",
            input_tokens: 10,
            output_tokens: 20,
          });
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
  });

  afterEach(() => cleanup());

  test("shows stale and partial state with citation navigation", async () => {
    renderPanel(<SynthesisPanel collectionId="col-1" papers={papers} />);

    expect(await screen.findByText("The collection studies systems.")).toBeTruthy();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByText("Partial (2/3 papers)")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    const link = screen.getByText(/Fast Scheduler · Summary p\.5/);
    expect(link.getAttribute("href")).toBe("/collections/col-1/papers/paper-a/pdf?page=5");
  });

  test("submits regeneration and polls the queued run", async () => {
    renderPanel(<SynthesisPanel collectionId="col-1" papers={papers} />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh intelligence" }));

    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const submitCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/collections/col-1/synthesis" &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(JSON.parse(String(submitCall![1]?.body))).toEqual({
        allow_partial: false,
        force: true,
      });
    });
    await waitFor(
      () => {
        const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
        expect(
          fetchMock.mock.calls.some(([url]) => String(url) === "/api/generation-runs/run-syn"),
        ).toBe(true);
      },
      { timeout: 3000 },
    );
  });
});

describe("SynthesisPanel empty state", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input) === "/api/collections/col-1/synthesis") {
          return Promise.resolve(new Response(null, { status: 404 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
  });

  afterEach(() => cleanup());

  test("offers generation when no synthesis exists", async () => {
    renderPanel(<SynthesisPanel collectionId="col-1" papers={papers} />);

    expect(await screen.findByText("No collection intelligence yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate intelligence" })).toBeTruthy();
  });

  test("requires an explicit partial-coverage choice when summaries are missing", async () => {
    renderPanel(
      <SynthesisPanel
        collectionId="col-1"
        papers={papers.map((paper, index) => ({ ...paper, summaryReady: index !== 2 }))}
      />,
    );

    const generate = await screen.findByRole("button", { name: "Generate intelligence" });
    expect(generate).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Continue with 2 of 3 papers" }));
    expect(generate).not.toBeDisabled();
  });
});

describe("ReportsPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/collections/col-1/reports" && init?.method === "POST") {
          return response({ report_id: "report-2", run_id: "run-rep-2", result: null }, 202);
        }
        if (url === "/api/collections/col-1/reports") {
          return response({ items: [reportView, queuedReportView] });
        }
        if (url === "/api/collections/col-1/reports/report-1" && init?.method === "DELETE") {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (url === "/api/collections/col-1/reports/report-1") {
          return response(reportView);
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
  });

  afterEach(() => cleanup());

  test("lists report history with states and opens the detail", async () => {
    const onFocusChange = vi.fn();
    renderPanel(
      <ReportsPanel collectionId="col-1" papers={papers} onFocusChange={onFocusChange} />,
    );

    expect(await screen.findByText("Literature review: Systems reading list")).toBeTruthy();
    expect(screen.getAllByText("Queued...").length).toBeGreaterThan(0);
    expect(await screen.findByText("The papers study systems [c-1].")).toBeTruthy();
    const link = screen.getByText(/Fast Scheduler · Summary p\.5/);
    expect(link.getAttribute("href")).toBe("/collections/col-1/papers/paper-a/pdf?page=5");
    fireEvent.click(screen.getByRole("button", { name: "Open reading view" }));
    expect(onFocusChange).toHaveBeenCalledWith(true, "report-1");
  });

  test("opens and controls the focused document reading view", async () => {
    const onFocusChange = vi.fn();
    renderPanel(
      <ReportsPanel
        collectionId="col-1"
        papers={papers}
        focused
        initialSelectedId="report-1"
        onFocusChange={onFocusChange}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Literature review: Systems reading list" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create document" })).toBeNull();
    expect(screen.queryByLabelText("Research document history")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Choose research document" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to research desk" }));

    expect(onFocusChange).toHaveBeenCalledWith(false);
  });

  test("confirms and deletes the selected research document", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPanel(<ReportsPanel collectionId="col-1" papers={papers} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete document" }));

    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === "/api/collections/col-1/reports/report-1" &&
          (init as RequestInit | undefined)?.method === "DELETE",
      )).toBe(true);
    });
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete research document "Literature review: Systems reading list"?',
    );
  });

  test("requires a prompt for custom reports and submits the selected kind", async () => {
    renderPanel(<ReportsPanel collectionId="col-1" papers={papers} />);

    const submit = await screen.findByRole("button", { name: "Create document" });
    fireEvent.click(screen.getByRole("radio", { name: /Custom/ }));
    expect(screen.getByLabelText("Custom document brief")).toBeTruthy();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Custom document brief"), {
      target: { value: "Compare evaluation setups" },
    });
    fireEvent.click(submit);

    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const submitCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/collections/col-1/reports" &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(JSON.parse(String(submitCall![1]?.body))).toEqual({
        kind: "custom",
        user_prompt: "Compare evaluation setups",
        allow_partial: false,
        force: false,
      });
    });
  });
});
