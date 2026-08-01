export default function PlanTab({ result }) {
  if (!result) {
    return (
      <div className="tab-panel">
        <div className="empty-state">
          <div className="empty-state-icon">🧩</div>
          <div className="empty-state-title">No Plan Yet</div>
          <div className="empty-state-desc">
            Generate a blog to see the orchestrated plan with tasks, goals, and structure.
          </div>
        </div>
      </div>
    );
  }

  const plan = result.plan;
  if (!plan) {
    return (
      <div className="tab-panel">
        <div className="info-banner">
          ℹ️ No plan data available (loaded from a past blog file).
        </div>
      </div>
    );
  }

  const planData = plan.model_dump ? plan.model_dump() : plan;
  const tasks = planData.tasks || [];

  return (
    <div className="tab-panel">
      <div className="card">
        {/* Plan Header */}
        <div className="card-header">
          <h2 className="card-title">{planData.blog_title || 'Untitled Blog'}</h2>
          <span className="badge badge-accent">{planData.blog_kind || 'explainer'}</span>
        </div>

        {/* Meta */}
        <div className="meta-row">
          <div className="meta-item">
            <span className="meta-label">Audience</span>
            <span className="meta-value">{planData.audience || '—'}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Tone</span>
            <span className="meta-value">{planData.tone || '—'}</span>
          </div>
          {planData.constraints?.length > 0 && (
            <div className="meta-item">
              <span className="meta-label">Constraints</span>
              <span className="meta-value">{planData.constraints.join(', ')}</span>
            </div>
          )}
        </div>

        {/* Tasks Table */}
        {tasks.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Section Title</th>
                <th>Target Words</th>
                <th>Research</th>
                <th>Citations</th>
                <th>Code</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {tasks
                .sort((a, b) => (a.id || 0) - (b.id || 0))
                .map((task) => (
                  <tr key={task.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{task.id}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{task.title}</td>
                    <td>{task.target_words}</td>
                    <td>
                      {task.requires_research ? (
                        <span className="badge badge-success">Yes</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {task.requires_citations ? (
                        <span className="badge badge-info">Yes</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {task.requires_code ? (
                        <span className="badge badge-warning">Yes</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {(task.tags || []).map((tag) => (
                        <span key={tag} className="badge badge-accent" style={{ marginRight: 4 }}>
                          {tag}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* Task Details Expandable */}
        {tasks.length > 0 && (
          <details style={{ marginTop: 16 }}>
            <summary
              style={{
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              View detailed task breakdown
            </summary>
            <div style={{ marginTop: 12 }}>
              {tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    padding: '12px 16px',
                    marginBottom: 8,
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                    {task.id}. {task.title}
                  </div>
                  <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {task.goal}
                  </div>
                  <ul style={{ paddingLeft: 18, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {(task.bullets || []).map((b, i) => (
                      <li key={i} style={{ marginBottom: 3 }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
