import { useQuery } from "@tanstack/react-query";

import { checkPdf, pdfUrl, type Paper } from "../../api/papers";

export function PdfReader({ paper, page }: { paper: Paper; page: string | null }) {
  const pageNumber = page && /^\d+$/.test(page) && Number(page) > 0 ? Number(page) : 1;
  const availability = useQuery({
    queryKey: ["pdf", paper.id],
    queryFn: () => checkPdf(paper.id),
    retry: false,
  });

  if (availability.isPending) {
    return <div className="artifact-message">Preparing PDF...</div>;
  }
  if (availability.error) {
    return (
      <div className="artifact-message is-error">
        <strong>PDF could not be opened.</strong>
        <p>{availability.error.message}</p>
      </div>
    );
  }

  const source = `${pdfUrl(paper.id)}#page=${pageNumber}&view=FitH`;
  return (
    <div className="pdf-reader">
      <div className="pdf-toolbar">
        <span>Page {pageNumber}</span>
        <a href={source} target="_blank" rel="noreferrer">Open in new tab</a>
      </div>
      <iframe key={`${paper.id}-${pageNumber}`} src={source} title={`${paper.title ?? paper.original_filename} PDF`} />
    </div>
  );
}
