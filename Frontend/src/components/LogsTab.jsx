import { useRef, useEffect } from 'react';

export default function LogsTab({ logs }) {
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!logs || logs.length === 0) {
    return (
      <div className="tab-panel">
        <div className="empty-state">
          <div className="empty-state-icon">🧾</div>
          <div className="empty-state-title">No Logs Yet</div>
          <div className="empty-state-desc">
            Generate a blog to see detailed event logs from the pipeline execution.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Event Logs</h2>
          <span className="badge badge-accent">{logs.length} events</span>
        </div>

        <div className="logs-container">
          {logs.map((entry, idx) => (
            <div key={idx} className="log-entry">
              {entry.node && <span className="log-node">[{entry.node}] </span>}
              <span>{entry.message}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
