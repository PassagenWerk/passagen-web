import type { Citation } from "../../api/conversations";

export function citationLabel(citation: Citation): string {
  const kindLabel =
    citation.artifact_kind === "summary_json"
      ? "Summary"
      : citation.artifact_kind === "outline_md"
        ? "Outline"
        : "Raw";
  const pageLabel = citation.page_start
    ? ` p.${citation.page_start}${citation.page_end && citation.page_end !== citation.page_start ? `-${citation.page_end}` : ""}`
    : "";
  return `${kindLabel}${citation.section ? ` §${citation.section}` : ""}${pageLabel}`;
}
