import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Paper } from "../../api/papers";
import { DisplayPreferencesProvider } from "../preferences/DisplayPreferencesProvider";
import { AskPanel } from "./AskPanel";

const paper: Paper = {
  id: "paper-1",
  title: "A Paper",
  abstract: null,
  cleaned_abstract: null,
  authors: [],
  year: 2024,
  venue: null,
  doi: null,
  arxiv_id: null,
  source_url: null,
  original_filename: "paper.pdf",
  status: "outlined",
  imported_at: "2026-01-01 10:00:00",
  updated_at: "2026-01-01 10:00:00",
  metadata_sources: {},
  tag_ids: [],
  artifacts: { summary: true, outline: true, pdf: true },
};

const conversation = {
  id: "conv-1",
  paper_id: "paper-1",
  title: "Latency",
  created_at: "2026-01-01 10:00:00",
  updated_at: "2026-01-01 10:00:00",
};

const userMessage = {
  id: "m-1",
  role: "user",
  content: "主要贡献是什么？",
  status: "completed",
  run_id: null,
  created_at: "2026-01-01 10:00:01",
  qa_record_id: null,
  sources: null,
  archived: false,
  citations: null,
  error_code: null,
  error_message: null,
  llm_call_count: null,
  input_tokens: null,
  output_tokens: null,
};

const assistantMessage = {
  id: "m-2",
  role: "assistant",
  content: "The latency result was 12 ms [c-1].",
  status: "completed",
  run_id: "run-1",
  created_at: "2026-01-01 10:00:02",
  qa_record_id: "qa-1",
  sources: ["summary", "raw"],
  archived: false,
  citations: [
    {
      citation_id: "c-1",
      artifact_kind: "summary_json",
      summary_path: "evaluation.results[0]",
      section: null,
      page_start: 5,
      page_end: 6,
      excerpt: "Latency dropped to 12 ms.",
    },
  ],
  error_code: null,
  error_message: null,
  llm_call_count: 2,
  input_tokens: 55,
  output_tokens: 25,
};

const failedMessage = {
  ...assistantMessage,
  id: "m-3",
  content: "",
  status: "failed",
  qa_record_id: null,
  sources: null,
  citations: null,
  error_code: "provider_error",
  error_message: "timeout",
};

const archivedRecord = {
  id: "qa-9",
  conversation_id: "conv-1",
  paper_id: "paper-1",
  standalone_question: "What workload was used?",
  answer_markdown: "RNIC [c-1].",
  intent: "fact_lookup",
  archived_at: "2026-01-01 11:00:00",
  archive_title: "Latency workload",
  archive_tags: ["eval"],
  citation_count: 1,
  created_at: "2026-01-01 10:00:02",
};

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DisplayPreferencesProvider>
        <MemoryRouter>
          <AskPanel
            paper={paper}
            paperPath="/papers/paper-1"
            readerView="summary"
            onOpenPdf={() => {}}
            onView={() => {}}
          />
        </MemoryRouter>
      </DisplayPreferencesProvider>
    </QueryClientProvider>,
  );
}

async function openPreviousConversation() {
  fireEvent.click(await screen.findByRole("button", { name: "History 1" }));
  fireEvent.click(screen.getByRole("button", { name: /Latency/ }));
}

describe("AskPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/conversations?paper_id=paper-1") {
          return response({ items: [conversation] });
        }
        if (url === "/api/conversations" && init?.method === "POST") {
          return response(conversation, 201);
        }
        if (url === "/api/conversations/conv-1") {
          if (init?.method === "PATCH") {
            return response({ ...conversation, title: JSON.parse(String(init.body)).title });
          }
          return response({
            conversation,
            messages: [userMessage, assistantMessage, failedMessage],
          });
        }
        if (url === "/api/conversations/conv-1/turns" && init?.method === "POST") {
          return response({
            message: { ...assistantMessage, id: "m-4", status: "pending" },
            run: null,
          });
        }
        if (url === "/api/qa-records/qa-1" && init?.method === "PATCH") {
          return response(archivedRecord);
        }
        if (url.startsWith("/api/qa-records?")) {
          return response({ items: [archivedRecord] });
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
  });

  afterEach(() => {
    window.localStorage.removeItem("passagen.reader-font-size");
    document.documentElement.style.removeProperty("--reader-font-size");
    cleanup();
  });

  test("renders answers with source badges and citation navigation", async () => {
    renderPanel();
    await openPreviousConversation();

    expect(await screen.findByText(/12 ms/)).toBeTruthy();
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.getByText("Raw sections")).toBeTruthy();
    expect(screen.getByText(/2 calls · 55 in \/ 25 out/)).toBeTruthy();

    const citation = screen.getByText("Summary p.5-6");
    expect(citation.getAttribute("href")).toBe(
      "/papers/paper-1/pdf?view=summary&ask=true&page=5",
    );
  });

  test("submits with Enter and keeps Shift+Enter as a newline", async () => {
    renderPanel();
    await screen.findByText("Read with a second set of eyes.");

    const question = screen.getByLabelText("Question");
    fireEvent.change(question, { target: { value: "What workload was used?" } });
    fireEvent.keyDown(question, { key: "Enter" });

    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const submitCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/conversations/conv-1/turns" &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(submitCall).toBeTruthy();
      expect(JSON.parse(String(submitCall![1]?.body))).toEqual({
        question: "What workload was used?",
      });
    });

    fireEvent.change(question, { target: { value: "First line" } });
    fireEvent.keyDown(question, { key: "Enter", shiftKey: true });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/turns") &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toHaveLength(1);
  });

  test("exposes the shared text size setting from Ask", async () => {
    renderPanel();
    await screen.findByText("Read with a second set of eyes.");

    fireEvent.click(screen.getByRole("button", { name: "Conversation text size" }));
    const slider = screen.getByLabelText("Conversation font size");
    fireEvent.change(slider, { target: { value: "21" } });

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--reader-font-size")).toBe("21px"),
    );
    expect(window.localStorage.getItem("passagen.reader-font-size")).toBe("21");
  });

  test("shows a stable failure with retry", async () => {
    renderPanel();
    await openPreviousConversation();

    expect(await screen.findByText(/Answer failed \(provider_error\)/)).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url) === "/api/conversations/conv-1/turns" &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  test("renames the active conversation from its title", async () => {
    renderPanel();
    await openPreviousConversation();

    fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
    fireEvent.change(screen.getByLabelText("Conversation title"), {
      target: { value: "RNIC latency" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const renameCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/conversations/conv-1" &&
          (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(JSON.parse(String(renameCall?.[1]?.body))).toEqual({ title: "RNIC latency" });
    });
  });

  test("shows the user question optimistically while submission is pending", async () => {
    renderPanel();
    await screen.findByText("Read with a second set of eyes.");
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const original = fetchMock.getMockImplementation()!;
    let submitted = false;
    let finishSubmission: (() => void) | undefined;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/conversations/conv-1" && submitted) {
        return response({
          conversation,
          messages: [
            userMessage,
            assistantMessage,
            failedMessage,
            { ...userMessage, id: "m-user-4", content: "How does eBPF work?" },
            { ...assistantMessage, id: "m-4", content: "", status: "pending" },
          ],
        });
      }
      if (String(input) === "/api/conversations/conv-1/turns" && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finishSubmission = () => {
            submitted = true;
            resolve(
              new Response(
                JSON.stringify({
                  message: { ...assistantMessage, id: "m-4", status: "pending" },
                  run: null,
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          };
        });
      }
      return original(input, init);
    });

    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "How does eBPF work?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(
      screen
        .getAllByText("How does eBPF work?")
        .some((element) => element.closest(".is-optimistic") !== null),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Running..." })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Answer is still running" })).toBeInTheDocument();
    await waitFor(() => expect(finishSubmission).toBeDefined());
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === "/api/conversations" &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(true);
    finishSubmission!();
    await waitFor(() => expect(document.querySelector(".is-optimistic")).toBeNull());
  });

  test("archives a completed answer with title and tags", async () => {
    renderPanel();
    await openPreviousConversation();

    fireEvent.click(await screen.findByText("Archive"));
    fireEvent.change(screen.getByLabelText("Archive title"), {
      target: { value: "Latency result" },
    });
    fireEvent.change(screen.getByLabelText("Archive tags"), { target: { value: "eval" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const archiveCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/qa-records/qa-1" &&
          (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(archiveCall).toBeTruthy();
      expect(JSON.parse(String(archiveCall![1]?.body))).toEqual({
        archived: true,
        title: "Latency result",
        tags: ["eval"],
      });
    });
  });

  test("saved tab lists archived answers with reuse and export actions", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("tab", { name: "Saved" }));

    expect(await screen.findByText("Latency workload")).toBeTruthy();
    expect(screen.getByText("eval")).toBeTruthy();
    expect(screen.getByText("Ask again")).toBeTruthy();
    expect(screen.getByText("Export JSON")).toBeTruthy();
  });
});
