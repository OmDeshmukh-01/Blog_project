const PIPELINE_NODES = [
  { key: 'router', label: 'Router' },
  { key: 'research', label: 'Research' },
  { key: 'orchestrator', label: 'Planner' },
  { key: 'worker', label: 'Writer' },
  { key: 'reducer', label: 'Finalize' },
];

export default function ProgressBar({ currentNode, isComplete, summary }) {
  if (!currentNode && !isComplete) return null;

  const currentIdx = PIPELINE_NODES.findIndex((n) => n.key === currentNode);

  return (
    <div className="progress-container">
      <div className="progress-title">
        {isComplete ? (
          <>✅ Blog generation complete!</>
        ) : (
          <>
            <span className="pulse-dot" />
            Generating blog…
          </>
        )}
      </div>

      <div className="progress-steps">
        {PIPELINE_NODES.map((node, idx) => {
          let status = '';
          if (isComplete) {
            status = 'completed';
          } else if (idx < currentIdx) {
            status = 'completed';
          } else if (idx === currentIdx) {
            status = 'active';
          }

          return <div key={node.key} className={`progress-step ${status}`} />;
        })}
      </div>

      <div className="progress-labels">
        {PIPELINE_NODES.map((node, idx) => {
          let status = '';
          if (isComplete) {
            status = 'completed';
          } else if (idx < currentIdx) {
            status = 'completed';
          } else if (idx === currentIdx) {
            status = 'active';
          }

          return (
            <span key={node.key} className={`progress-label ${status}`}>
              {node.label}
            </span>
          );
        })}
      </div>

      {/* Live Summary */}
      {summary && !isComplete && (
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
          }}
        >
          {summary.mode && (
            <span>
              Mode: <strong style={{ color: 'var(--text-secondary)' }}>{summary.mode}</strong>
            </span>
          )}
          {summary.evidenceCount > 0 && (
            <span>
              Evidence:{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>{summary.evidenceCount}</strong>
            </span>
          )}
          {summary.taskCount > 0 && (
            <span>
              Tasks:{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>{summary.taskCount}</strong>
            </span>
          )}
          {summary.sectionsDone > 0 && (
            <span>
              Sections:{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>{summary.sectionsDone}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
