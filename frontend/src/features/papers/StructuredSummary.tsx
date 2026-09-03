function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && value !== null && Object.keys(value).length === 0)
  );
}

function SummaryValue({ name, value, depth = 0 }: { name: string; value: unknown; depth?: number }) {
  if (isEmpty(value) || name === "schema_version") return null;

  if (Array.isArray(value)) {
    return (
      <section className={`summary-block depth-${Math.min(depth, 2)}`}>
        <h3>{labelFor(name)}</h3>
        <ul className="summary-list">
          {value.map((item, index) => (
            <li key={`${name}-${index}`}>
              {typeof item === "object" && item !== null ? (
                <div className="summary-object">
                  {Object.entries(item).map(([key, nested]) => (
                    <SummaryValue key={key} name={key} value={nested} depth={depth + 1} />
                  ))}
                </div>
              ) : (
                String(item)
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <section className={`summary-block depth-${Math.min(depth, 2)}`}>
        <h3>{labelFor(name)}</h3>
        <div className="summary-object">
          {Object.entries(value).map(([key, nested]) => (
            <SummaryValue key={key} name={key} value={nested} depth={depth + 1} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="summary-field">
      <dt>{labelFor(name)}</dt>
      <dd>{String(value)}</dd>
    </div>
  );
}

export function StructuredSummary({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="structured-summary">
      {Object.entries(content).map(([key, value]) => (
        <SummaryValue key={key} name={key} value={value} />
      ))}
    </div>
  );
}
