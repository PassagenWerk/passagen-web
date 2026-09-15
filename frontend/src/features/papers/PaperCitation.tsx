import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { fetchCitation } from "../../api/papers";
import { useEscapeClose } from "../../components/useEscapeClose";

const sourceLabels = {
  doi: "DOI metadata",
  arxiv: "arXiv metadata",
  local_metadata: "Local metadata fallback",
};

export function PaperCitation({ paperId }: { paperId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const citation = useQuery({
    queryKey: ["citation", paperId],
    queryFn: () => fetchCitation(paperId),
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  useEscapeClose(open, () => {
    setOpen(false);
    trigger.current?.focus();
  });

  async function copy() {
    if (!citation.data) return;
    setCopied(false);
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(citation.data.content);
      setCopied(true);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div className="paper-action paper-citation">
      <button
        ref={trigger}
        className="paper-action-button"
        type="button"
        aria-expanded={open}
        aria-controls="paper-citation-panel"
        onClick={() => {
          setCopied(false);
          setCopyError(false);
          setOpen((value) => !value);
        }}
      >Cite</button>
      {open ? (
        <div
          className="editor-section settings-panel paper-action-panel citation-action-panel"
          id="paper-citation-panel"
          role="dialog"
          aria-label="Cite paper"
        >
          <div className="editor-heading">
            <strong>BibTeX</strong>
            {citation.data ? (
              <span>
                {sourceLabels[citation.data.source]}
                {citation.data.authoritative ? " / authoritative" : " / review before use"}
              </span>
            ) : null}
          </div>
          {citation.isPending ? <span>Retrieving citation...</span> : null}
          {citation.error ? (
            <span className="form-status is-error">Citation unavailable: {citation.error.message}</span>
          ) : null}
          {citation.data ? (
            <>
              <pre className="citation-content">{citation.data.content}</pre>
              {citation.data.warnings.map((warning) => (
                <span className="form-status" key={warning}>{warning}</span>
              ))}
              <button type="button" onClick={() => void copy()}>Copy BibTeX</button>
              {copied ? <span className="form-status is-saved">Copied.</span> : null}
              {copyError ? (
                <span className="form-status is-error">Clipboard access failed.</span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
