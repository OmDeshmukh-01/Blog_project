import { useState, useEffect, useRef } from 'react';
import { listBlogs, getBlog, deleteBlog } from '../api';

export default function Sidebar({ onGenerate, isGenerating }) {
  const [topic, setTopic] = useState('');
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [pastBlogs, setPastBlogs] = useState([]);
  const [selectedBlog, setSelectedBlog] = useState(null);
  const textareaRef = useRef(null);

  // Load past blogs on mount
  useEffect(() => {
    listBlogs().then(setPastBlogs).catch(() => {});
  }, [isGenerating]); // Refresh after generation completes

  const handleGenerate = () => {
    if (!topic.trim() || isGenerating) return;
    onGenerate({ topic: topic.trim(), as_of: asOf });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleLoadBlog = async (blog) => {
    setSelectedBlog(blog.id);
    const data = await getBlog(blog.id);
    if (data) {
      onGenerate(null, {
        plan: null,
        evidence: [],
        final: data.content,
        genre: data.genre,
        _loaded: true,
      });
    }
  };

  const handleDeleteBlog = async (e, blog) => {
    e.stopPropagation(); // prevent loading the blog
    if (window.confirm(`Are you sure you want to delete "${blog.title}"?`)) {
      const success = await deleteBlog(blog.id);
      if (success) {
        setPastBlogs(prev => prev.filter(b => b.id !== blog.id));
        if (selectedBlog === blog.id) {
          setSelectedBlog(null);
        }
      } else {
        alert("Failed to delete blog.");
      }
    }
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">✍️</div>
        <h1>Blog Writer</h1>
      </div>

      {/* Generate Section */}
      <div className="sidebar-section">
        <span className="sidebar-section-title">New Blog</span>

        <div className="form-group">
          <label className="form-label" htmlFor="topic-input">
            Topic
          </label>
          <textarea
            ref={textareaRef}
            id="topic-input"
            className="form-textarea"
            placeholder="e.g. How Attention Mechanisms Work in Transformers"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="date-input">
            As-of Date
          </label>
          <input
            id="date-input"
            type="date"
            className="form-input"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            disabled={isGenerating}
          />
        </div>

        <button
          id="generate-btn"
          className={`btn btn-primary btn-full ${isGenerating ? 'btn-loading' : ''}`}
          onClick={handleGenerate}
          disabled={!topic.trim() || isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="btn-spinner" />
              Generating…
            </>
          ) : (
            <>🚀 Generate Blog</>
          )}
        </button>
      </div>

      <div className="divider" />

      {/* Past Blogs */}
      <div className="sidebar-section">
        <span className="sidebar-section-title">Past Blogs</span>

        {pastBlogs.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            No saved blogs yet.
          </p>
        ) : (
          <div className="past-blog-list">
            {pastBlogs.map((blog) => (
              <div key={blog.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                <button
                  className={`past-blog-item ${selectedBlog === blog.id ? 'selected' : ''}`}
                  onClick={() => handleLoadBlog(blog)}
                  disabled={isGenerating}
                  style={{ flex: 1 }}
                >
                  <span className="past-blog-item-icon">📄</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', overflow: 'hidden' }}>
                    <span className="past-blog-item-title">{blog.title}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{blog.genre}</span>
                  </div>
                </button>
                <button 
                  onClick={(e) => handleDeleteBlog(e, blog)}
                  disabled={isGenerating}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '4px',
                    opacity: 0.6,
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                  title="Delete blog"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
