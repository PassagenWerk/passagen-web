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
    schema_version: "1",
    overview: "The collection studies systems.",
    themes: [
      {
        name: "Systems",
        description: "The papers study systems.",
        paper_ids: ["paper-a"],
        citation_ids: ["c-1"],
      },
    ],
    comparison_matrix: { dimensions: [], rows: [] },
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
    expect(screen.getByText("Generated · direct")).toBeTruthy();
    const link = screen.getByText(/Fast Scheduler · Summary p\.5/);
    expect(link.getAttribute("href")).toBe("/collections/col-1/papers/paper-a/pdf?page=5");
  });

  test("submits regeneration and polls the queued run", async () => {
    renderPanel(<SynthesisPanel collectionId="col-1" papers={papers} />);

    fireEvent.click(await screen.findByRole("button", { name: "Regenerate synthesis" }));

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

    expect(await screen.findByText("No synthesis yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate synthesis" })).toBeTruthy();
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
        if (url === "/api/collections/col-1/reports/report-1") {
          return response(reportView);
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
  });

  afterEach(() => cleanup());

  test("lists report history with states and opens the detail", async () => {
    renderPanel(<ReportsPanel collectionId="col-1" papers={papers} />);

    expect(await screen.findByText("Literature review: Systems reading list")).toBeTruthy();
    expect(screen.getAllByText("Queued...").length).toBeGreaterThan(0);
    expect(await screen.findByText("The papers study systems [c-1].")).toBeTruthy();
    const link = screen.getByText(/Fast Scheduler · Summary p\.5/);
    expect(link.getAttribute("href")).toBe("/collections/col-1/papers/paper-a/pdf?page=5");
  });

  test("requires a prompt for custom reports and submits the selected kind", async () => {
    renderPanel(<ReportsPanel collectionId="col-1" papers={papers} />);

    const submit = await screen.findByRole("button", { name: "Generate report" });
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByLabelText("Custom report prompt")).toBeTruthy();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Custom report prompt"), {
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
