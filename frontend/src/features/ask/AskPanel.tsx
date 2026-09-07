import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";

import {
  createConversation,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  renameConversation,
  submitTurn,
  type Citation,
  type ConversationMessage,
} from "../../api/conversations";
import type { Paper } from "../../api/papers";
import { useEscapeClose } from "../../components/useEscapeClose";
import { useDisplayPreferences } from "../preferences/displayPreferences";
import {
  archiveQaRecord,
  fetchQaRecord,
  searchQaRecords,
  unarchiveQaRecord,
} from "../../api/qaRecords";

const SOURCE_LABELS: Record<string, string> = {
  conversation: "History",
  previous_qa: "Saved answer",
  summary: "Summary",
  outline: "Outline",
  raw: "Raw sections",
  collection_summary: "Collection",
  paper_summaries: "Summaries",
};

interface AskPanelProps {
  paper: Paper;
  paperPath: string;
  readerView: "summary" | "outline" | "note";
  onOpenPdf: () => void;
  onView: (view: "summary" | "outline" | "note") => void;
}

export function AskPanel({ paper, paperPath, readerView, onOpenPdf, onView }: AskPanelProps) {
  const [mode, setMode] = useState<"chat" | "saved">("chat");
  const [prefill, setPrefill] = useState<string | null>(null);
  return (
    <section className="ask-panel" aria-label="Ask about this paper">
      <div className="abstract-version-toggle ask-mode" role="tablist" aria-label="Ask mode">
        <button type="button" role="tab" aria-selected={mode === "chat"} onClick={() => setMode("chat")}>
          Chat
        </button>
        <button type="button" role="tab" aria-selected={mode === "saved"} onClick={() => setMode("saved")}>
          Saved
        </button>
      </div>
      {mode === "chat" ? (
        <AskChat
          paper={paper}
          paperPath={paperPath}
          readerView={readerView}
          onOpenPdf={onOpenPdf}
          onView={onView}
          prefill={prefill}
          onPrefillConsumed={() => setPrefill(null)}
        />
      ) : (
        <SavedAnswers
          paper={paper}
          onAsk={(question) => {
            setPrefill(question);
            setMode("chat");
          }}
        />
      )}
    </section>
  );
}

function AskChat({
  paper,
  paperPath,
  readerView,
  onOpenPdf,
  onView,
  prefill,
  onPrefillConsumed,
}: AskPanelProps & { prefill: string | null; onPrefillConsumed: () => void }) {
  const queryClient = useQueryClient();
  const { readerFontSize, setReaderFontSize } = useDisplayPreferences();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [optimisticQuestion, setOptimisticQuestion] = useState<{
    question: string;
    answerMessageId: string | null;
  } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [textSettingsOpen, setTextSettingsOpen] = useState(false);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const textSettingsToggle = useRef<HTMLButtonElement>(null);
  const messageList = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setConversationId(null);
    setDraft("");
    setOptimisticQuestion(null);
    setHistoryOpen(false);
    setTextSettingsOpen(false);
  }, [paper.id]);
  useEscapeClose(historyOpen, () => {
    setHistoryOpen(false);
    historyToggle.current?.focus();
  });
  useEscapeClose(textSettingsOpen, () => {
    setTextSettingsOpen(false);
    textSettingsToggle.current?.focus();
  });
  useEffect(() => {
    if (prefill !== null) {
      setDraft(prefill);
      onPrefillConsumed();
    }
  }, [prefill, onPrefillConsumed]);

  const conversations = useQuery({
    queryKey: ["conversations", paper.id],
    queryFn: () => fetchConversations(paper.id),
  });
  const selectedId = conversationId;
  const detail = useQuery({
    queryKey: ["conversation", selectedId],
    queryFn: () => fetchConversation(selectedId!),
    enabled: selectedId !== null,
    refetchInterval: (query) =>
      query.state.data?.messages.some((message) => message.status === "pending") ? 900 : false,
  });

  const invalidate = (targetId = selectedId) => {
    if (targetId) void queryClient.invalidateQueries({ queryKey: ["conversation", targetId] });
    void queryClient.invalidateQueries({ queryKey: ["conversations", paper.id] });
  };
  const invalidateArchived = () => {
    invalidate();
    void queryClient.invalidateQueries({ queryKey: ["qa-records", paper.id] });
  };
  const rename = useMutation({
    mutationFn: (title: string) => renameConversation(selectedId!, title),
    onSuccess: () => {
      setRenaming(false);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteConversation(selectedId!),
    onSuccess: () => {
      setConversationId(null);
      setHistoryOpen(false);
      invalidate();
    },
  });
  const ask = useMutation({
    mutationFn: async (question: string) => {
      const created = selectedId ? null : await createConversation(paper.id);
      const targetId = selectedId ?? created!.id;
      try {
        const turn = await submitTurn(targetId, question);
        return { turn, conversationId: targetId };
      } catch (error) {
        if (created) await deleteConversation(created.id).catch(() => undefined);
        throw error;
      }
    },
    onMutate: (question) => {
      setOptimisticQuestion({ question, answerMessageId: null });
    },
    onSuccess: ({ turn, conversationId: targetId }) => {
      setConversationId(targetId);
      setDraft("");
      setOptimisticQuestion((current) =>
        current ? { ...current, answerMessageId: turn.message.id } : null,
      );
      invalidate(targetId);
    },
    onError: () => setOptimisticQuestion(null),
  });

  const messages = useMemo(() => detail.data?.messages ?? [], [detail.data]);
  const hasPendingMessage = messages.some((message) => message.status === "pending");
  const isRunning = ask.isPending || optimisticQuestion !== null || hasPendingMessage;
  useEffect(() => {
    if (
      optimisticQuestion?.answerMessageId &&
      messages.some((message) => message.id === optimisticQuestion.answerMessageId)
    ) {
      setOptimisticQuestion(null);
    }
  }, [messages, optimisticQuestion]);
  useEffect(() => {
    if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [messages, optimisticQuestion]);
  const askAnother = (question: string) => ask.mutate(question);

  return (
    <div className="ask-chat">
      <div className="ask-session-bar">
        <div>
          <span>{selectedId ? "Conversation" : "Ready to explore"}</span>
          {selectedId && renaming ? (
            <form
              className="ask-title-edit"
              onSubmit={(event) => {
                event.preventDefault();
                if (renameDraft.trim()) rename.mutate(renameDraft.trim());
              }}
            >
              <input
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                aria-label="Conversation title"
              />
              <button type="submit" disabled={rename.isPending}>Save</button>
              <button type="button" onClick={() => setRenaming(false)}>Cancel</button>
            </form>
          ) : (
            <div className="ask-title-row">
              <strong>{detail.data?.conversation.title ?? "New conversation"}</strong>
              {selectedId ? (
                <button
                  type="button"
                  aria-label="Rename conversation"
                  onClick={() => {
                    setRenameDraft(detail.data?.conversation.title ?? "");
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
              ) : null}
            </div>
          )}
        </div>
        <div className="ask-session-actions">
          <div className="ask-text-settings">
            <button
            ref={textSettingsToggle}
            className="reader-settings-toggle"
            type="button"
            aria-label="Conversation text size"
            aria-expanded={textSettingsOpen}
            aria-controls="ask-text-size-settings"
            onClick={() => {
              setHistoryOpen(false);
              setTextSettingsOpen((open) => !open);
            }}
          >Aa</button>
          {textSettingsOpen ? (
            <fieldset
              className="settings-panel reader-settings-panel ask-text-settings-panel"
              id="ask-text-size-settings"
            >
              <legend>Reading and conversation text</legend>
              <output htmlFor="ask-font-size">{readerFontSize}px</output>
              <div className="reader-size-slider">
                <span aria-hidden="true">A</span>
                <input
                  id="ask-font-size"
                  type="range"
                  min="14"
                  max="24"
                  step="1"
                  value={readerFontSize}
                  aria-label="Conversation font size"
                  onChange={(event) => setReaderFontSize(Number(event.target.value))}
                />
                <span aria-hidden="true">A</span>
              </div>
            </fieldset>
          ) : null}
          </div>
          <div className="ask-history">
          <button
            ref={historyToggle}
            className="reader-settings-toggle"
            type="button"
            aria-expanded={historyOpen}
            aria-controls="ask-history-panel"
            onClick={() => {
              setTextSettingsOpen(false);
              setHistoryOpen((open) => !open);
            }}
          >
            History {conversations.data?.items.length ?? 0}
          </button>
          {historyOpen ? (
            <div className="settings-panel ask-history-panel" id="ask-history-panel">
              <div className="ask-history-heading">
                <strong>Conversations</strong>
                <button
                  type="button"
                  onClick={() => {
                    setConversationId(null);
                    setRenaming(false);
                    setHistoryOpen(false);
                  }}
                >
                  New conversation
                </button>
              </div>
              <div className="ask-history-list">
                {(conversations.data?.items ?? []).map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    className={conversation.id === selectedId ? "is-active" : ""}
                    onClick={() => {
                      setConversationId(conversation.id);
                      setRenaming(false);
                      setHistoryOpen(false);
                    }}
                  >
                    <strong>{conversation.title}</strong>
                    <span>{new Date(conversation.updated_at).toLocaleDateString()}</span>
                  </button>
                ))}
                {conversations.data?.items.length === 0 ? (
                  <p>No previous conversations.</p>
                ) : null}
              </div>
              {selectedId ? (
                <div className="ask-history-actions">
                  <button
                    type="button"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                  >
                    Delete selected
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {!selectedId && !optimisticQuestion ? (
        <div className="ask-welcome">
          <span aria-hidden="true">?</span>
          <strong>Read with a second set of eyes.</strong>
          <p>Ask about a claim, method, result, or limitation. Answers stay grounded in this paper.</p>
        </div>
      ) : null}

      <ol ref={messageList} className="ask-messages" aria-live="polite">
        {messages.map((message, index) => (
          <AskMessage
            key={message.id}
            message={message}
            paperPath={paperPath}
            readerView={readerView}
            onOpenPdf={onOpenPdf}
            onView={onView}
            onRetry={() => {
              const question = [...messages.slice(0, index)].reverse().find((m) => m.role === "user");
              if (question) askAnother(question.content);
            }}
            onArchived={invalidateArchived}
          />
        ))}
        {optimisticQuestion ? (
          <>
            <li className="ask-message is-user is-optimistic">
              <div className="markdown">{optimisticQuestion.question}</div>
            </li>
            {!hasPendingMessage ? (
              <li className="ask-message is-assistant is-pending">
                <ThinkingIndicator />
              </li>
            ) : null}
          </>
        ) : null}
      </ol>

      <form
        className="ask-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isRunning && draft.trim()) ask.mutate(draft.trim());
        }}
      >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about the problem, methods, experiments, or limitations..."
            aria-label="Question"
            rows={2}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!isRunning && draft.trim()) event.currentTarget.form?.requestSubmit();
            }}
          />
          <button
            type="submit"
            disabled={isRunning || !draft.trim()}
          >
            {isRunning ? "Running..." : "Ask"}
          </button>
      </form>
      {ask.error ? <span className="form-status is-error">Not sent: {ask.error.message}</span> : null}
    </div>
  );
}

function AskMessage({
  message,
  paperPath,
  readerView,
  onOpenPdf,
  onView,
  onRetry,
  onArchived,
}: {
  message: ConversationMessage;
  paperPath: string;
  readerView: "summary" | "outline" | "note";
  onOpenPdf: () => void;
  onView: (view: "summary" | "outline" | "note") => void;
  onRetry: () => void;
  onArchived: () => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTitle, setArchiveTitle] = useState("");
  const [archiveTags, setArchiveTags] = useState("");
  const archive = useMutation({
    mutationFn: () =>
      archiveQaRecord(
        message.qa_record_id!,
        archiveTitle.trim(),
        archiveTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      ),
    onSuccess: () => {
      setArchiveOpen(false);
      onArchived();
    },
  });

  if (message.role === "user") {
    return (
      <li className="ask-message is-user">
        <div className="markdown">{message.content}</div>
      </li>
    );
  }
  return (
    <li className={`ask-message is-assistant is-${message.status}`}>
      {message.status === "pending" ? <ThinkingIndicator /> : null}
      {message.status === "failed" ? (
        <div className="ask-failed">
          <span>Answer failed{message.error_code ? ` (${message.error_code})` : ""}.</span>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      ) : null}
      {message.status === "completed" ? (
        <>
          <div className="markdown">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
          <div className="ask-meta">
            {message.sources?.map((source) => (
              <span key={source} className="ask-source-badge">
                {SOURCE_LABELS[source] ?? source}
              </span>
            ))}
            {message.archived ? <span className="ask-source-badge is-archived">Archived</span> : null}
            {message.run_id ? (
              <span className="form-status" title={`Generation run ${message.run_id}`}>
                Run {message.run_id.slice(0, 8)}
                {message.llm_call_count !== null
                  ? ` · ${message.llm_call_count} calls · ${message.input_tokens ?? 0} in / ${message.output_tokens ?? 0} out`
                  : ""}
              </span>
            ) : null}
          </div>
          {message.citations && message.citations.length > 0 ? (
            <div className="ask-citations">
              {message.citations.map((citation) => (
                <CitationLink
                  key={citation.citation_id}
                  citation={citation}
                  paperPath={paperPath}
                  readerView={readerView}
                  onOpenPdf={onOpenPdf}
                  onView={onView}
                />
              ))}
            </div>
          ) : null}
          {message.qa_record_id && !message.archived ? (
            archiveOpen ? (
              <form
                className="ask-archive-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (archiveTitle.trim()) archive.mutate();
                }}
              >
                <input
                  value={archiveTitle}
                  onChange={(event) => setArchiveTitle(event.target.value)}
                  placeholder="Archive title"
                  aria-label="Archive title"
                />
                <input
                  value={archiveTags}
                  onChange={(event) => setArchiveTags(event.target.value)}
                  placeholder="Tags, comma separated"
                  aria-label="Archive tags"
                />
                <button type="submit" disabled={archive.isPending || !archiveTitle.trim()}>
                  Save
                </button>
                {archive.error ? (
                  <span className="form-status is-error">{archive.error.message}</span>
                ) : null}
              </form>
            ) : (
              <button type="button" className="ask-archive" onClick={() => setArchiveOpen(true)}>
                Archive
              </button>
            )
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function ThinkingIndicator() {
  return (
    <div className="ask-thinking" role="status" aria-label="Answer is still running">
      <span>Answering</span>
      <span className="ask-thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function CitationLink({
  citation,
  paperPath,
  readerView,
  onOpenPdf,
  onView,
}: {
  citation: Citation;
  paperPath: string;
  readerView: "summary" | "outline" | "note";
  onOpenPdf: () => void;
  onView: (view: "summary" | "outline" | "note") => void;
}) {
  const kindLabel =
    citation.artifact_kind === "summary_json"
      ? "Summary"
      : citation.artifact_kind === "outline_md"
        ? "Outline"
        : "Raw";
  const pageLabel = citation.page_start
    ? ` p.${citation.page_start}${citation.page_end && citation.page_end !== citation.page_start ? `-${citation.page_end}` : ""}`
    : "";
  const label = `${kindLabel}${citation.section ? ` §${citation.section}` : ""}${pageLabel}`;
  if (citation.page_start) {
    const evidenceView = citation.artifact_kind === "summary_json"
      ? "summary"
      : citation.artifact_kind === "outline_md"
        ? "outline"
        : readerView;
    return (
      <Link
        className="evidence-page-link"
        to={`${paperPath}/pdf?view=${evidenceView}&ask=true&page=${citation.page_start}`}
        onClick={onOpenPdf}
        title={citation.excerpt ?? undefined}
      >
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="evidence-page-link"
      title={citation.excerpt ?? undefined}
      onClick={() => onView(citation.artifact_kind === "outline_md" ? "outline" : "summary")}
    >
      {label}
    </button>
  );
}

function SavedAnswers({ paper, onAsk }: { paper: Paper; onAsk: (question: string) => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const saved = useQuery({
    queryKey: ["qa-records", paper.id, query],
    queryFn: () => searchQaRecords({ q: query || undefined, archived: true, paperId: paper.id }),
  });
  const unarchive = useMutation({
    mutationFn: (id: string) => unarchiveQaRecord(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["qa-records", paper.id] }),
  });

  const exportJson = async (id: string) => {
    const record = await fetchQaRecord(id);
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qa-record-${id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ask-saved">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search saved answers..."
        aria-label="Search saved answers"
      />
      {saved.isPending ? <div className="artifact-message">Searching...</div> : null}
      {saved.data?.items.length === 0 ? (
        <div className="artifact-message">
          <strong>No saved answers.</strong>
          <p>Archive a valuable answer from the chat to reuse it here.</p>
        </div>
      ) : null}
      <ol className="ask-saved-list">
        {saved.data?.items.map((record) => (
          <li key={record.id} className="ask-saved-item">
            <div className="ask-saved-heading">
              <strong>{record.archive_title ?? record.standalone_question}</strong>
              {record.archive_tags.map((tag) => (
                <span className="tag-chip" key={`${record.id}-${tag}`}>{tag}</span>
              ))}
            </div>
            <p className="ask-saved-question">{record.standalone_question}</p>
            <div className="markdown ask-saved-answer">
              <ReactMarkdown>{record.answer_markdown}</ReactMarkdown>
            </div>
            <div className="ask-saved-actions">
              <span className="form-status">{record.citation_count} citations</span>
              <button type="button" onClick={() => onAsk(record.standalone_question)}>
                Ask again
              </button>
              <button type="button" onClick={() => void exportJson(record.id)}>
                Export JSON
              </button>
              <button type="button" onClick={() => unarchive.mutate(record.id)}>
                Unarchive
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
