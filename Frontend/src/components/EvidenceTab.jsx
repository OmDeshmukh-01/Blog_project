export default function EvidenceTab({ result }) {
  if (!result) {
    return (
      <div className="tab-panel">
        <div className="empty-state">
          <div className="empty-state-icon">🔎</div>
          <div className="empty-state-title">No Evidence Yet</div>
          <div className="empty-state-desc">
            Generate a blog to see research evidence gathered via web search.
          </div>
        </div>
      </div>
    );
  }

  const evidence = result.evidence || [];

  if (evidence.length === 0) {
    return (
      <div className="tab-panel">
        <div className="info-banner">
          ℹ️ No evidence returned — the topic likely used <strong>&nbsp;closed_book&nbsp;</strong> mode
          (evergreen content that doesn't need web research).
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Research Evidence</h2>
          <span className="badge badge-info">{evidence.length} sources</span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Published</th>
              <th>Source</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((item, idx) => {
              const e = item.model_dump ? item.model_dump() : item;
              return (
                <tr key={idx}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500, maxWidth: 280 }}>
                    {e.title || '—'}
                  </td>
                  <td>
                    {e.published_at ? (
                      <span className="badge badge-accent">{e.published_at}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td>{e.source || '—'}</td>
                  <td>
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.82rem',
                          wordBreak: 'break-all',
                        }}
                      >
                        {new URL(e.url).hostname}
                        <span style={{ opacity: 0.5, marginLeft: 4 }}>↗</span>
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
