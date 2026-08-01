const TABS = [
  { id: 'plan', label: 'Plan', icon: '🧩' },
  { id: 'evidence', label: 'Evidence', icon: '🔎' },
  { id: 'preview', label: 'Preview', icon: '📝' },
  { id: 'knowledge', label: 'Knowledge Base', icon: '🧠' },
  { id: 'logs', label: 'Logs', icon: '🧾' },
];

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="tab-bar" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span>{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
