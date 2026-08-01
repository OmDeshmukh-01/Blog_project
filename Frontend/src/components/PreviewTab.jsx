import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function safeSlug(title) {
  let s = title.trim().toLowerCase();
  s = s.replace(/[^a-z0-9 _-]+/g, '');
  s = s.replace(/\s+/g, '_').replace(/^_|_$/g, '');
  return s || 'blog';
}

export default function PreviewTab({ result }) {
  if (!result) {
    return (
      <div className="tab-panel">
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-title">No Preview Yet</div>
          <div className="empty-state-desc">
            Generate a blog to see the rendered Markdown preview with download options.
          </div>
        </div>
      </div>
    );
  }

  const finalMd = result.final || '';

  if (!finalMd) {
    return (
      <div className="tab-panel">
        <div className="warning-banner">⚠️ No final markdown found in the output.</div>
      </div>
    );
  }

  // Extract title for file naming
  let blogTitle = 'blog';
  const plan = result.plan;
  if (plan) {
    blogTitle = (typeof plan === 'object' ? plan.blog_title : null) || 'blog';
  } else {
    // Try to extract from markdown
    for (const line of finalMd.split('\n')) {
      if (line.startsWith('# ')) {
        blogTitle = line.slice(2).trim();
        break;
      }
    }
  }

  const mdFilename = `${safeSlug(blogTitle)}.md`;

  const handleDownload = () => {
    const blob = new Blob([finalMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mdFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tab-panel">
      <div className="card" style={{ padding: '36px' }}>
        <div className="card-header" style={{ paddingBottom: '20px', marginBottom: '28px' }}>
          <div>
            <h2 className="card-title" style={{ fontSize: '1.8rem', marginBottom: '8px', letterSpacing: '-0.03em' }}>{blogTitle}</h2>
            {result.genre && (
              <span className="badge badge-accent">{result.genre} Blog</span>
            )}
          </div>
          <div className="download-actions" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
            <button className="btn btn-download" onClick={handleDownload} id="download-md-btn">
              ⬇️ Download Markdown
            </button>
          </div>
        </div>

        <div className="markdown-preview" style={{ maxWidth: '760px', margin: '0 auto' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalMd}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
