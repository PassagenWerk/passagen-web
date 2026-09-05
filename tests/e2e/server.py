import atexit
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from passagen.stages.abstract_fixing import CleanedAbstractArtifact
from passagen.storage.database import connect_database, initialize_database

from passagen_web.cli import main


def create_library() -> Path:
    data_dir = Path(tempfile.mkdtemp(prefix="passagen-web-e2e-"))
    atexit.register(shutil.rmtree, data_dir, ignore_errors=True)
    initialize_database(data_dir / "passagen.db")
    with connect_database(data_dir / "passagen.db") as connection:
        papers = (
            ("paper-a", "Alpha Systems", "An author-written overview of Alpha Systems."),
            ("paper-b", "Beta Storage", None),
        )
        for paper_id, title, abstract in papers:
            connection.execute(
                """
                INSERT INTO papers
                    (id, title, abstract, authors_json, year, venue, original_filename, pdf_sha256,
                     status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    paper_id,
                    title,
                    abstract,
                    json.dumps(["Ada Author"]),
                    2026,
                    "SOSP",
                    f"{paper_id}.pdf",
                    paper_id.ljust(64, "0"),
                    "outlined",
                ),
            )

    summary = (
        b'{"schema_version":"2","identity":{"title":"Alpha Systems"},'
        b'"problem":{"problem_statement":"A release-quality problem"}}'
    )
    outline = b"# Release outline\n\n- Evidence pages: 1\n"
    pdf = b"%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n"
    raw_abstract = "An author-written overview of Alpha Systems."
    cleaned_abstract = (
        CleanedAbstractArtifact(
            paper_id="paper-a",
            raw_abstract_sha256=hashlib.sha256(raw_abstract.encode()).hexdigest(),
            prompt_sha256="b" * 64,
            model="test-model",
            cleaned_abstract="A cleaned author-written overview of Alpha Systems.",
            corrections=["Repaired extraction spacing"],
        ).model_dump_json()
        + "\n"
    ).encode()
    artifacts = (
        ("summary_json", "summary.json", summary),
        ("outline_md", "outline.md", outline),
        ("original_pdf", "paper.pdf", pdf),
        ("abstract_cleaned_json", "abstract.cleaned.json", cleaned_abstract),
    )
    with connect_database(data_dir / "passagen.db") as connection:
        for kind, filename, content in artifacts:
            path = data_dir / "artifacts" / filename
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(content)
            connection.execute(
                """
                INSERT INTO artifacts (id, paper_id, kind, path, size_bytes)
                VALUES (?, ?, ?, ?, ?)
                """,
                (f"paper-a-{kind}", "paper-a", kind, str(path.relative_to(data_dir)), len(content)),
            )
    return data_dir


if __name__ == "__main__":
    main(
        [
            "serve",
            "--data-dir",
            str(create_library()),
            "--port",
            "8766",
            "--no-open",
        ]
    )
