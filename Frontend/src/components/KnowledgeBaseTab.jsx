import { useState, useEffect, useRef } from 'react';
import { uploadDocument, getKbStats } from '../api';

export default function KnowledgeBaseTab() {
  const [stats, setStats] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const data = await getKbStats();
    setStats(data);
  };

  const handleFiles = async (files) => {
    const validFiles = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.type.startsWith('text/')
        || f.name.endsWith('.md') || f.name.endsWith('.txt')
    );

    if (validFiles.length === 0) {
      alert('Please upload PDF or text files only.');
      return;
    }

    setIsUploading(true);
    const results = [];

    for (const file of validFiles) {
      try {
        const result = await uploadDocument(file, file.name);
        results.push({
          name: file.name,
          chunks: result.chunks_added,
          chars: result.characters,
          status: 'success',
        });
      } catch (err) {
        results.push({
          name: file.name,
          error: err.message,
          status: 'error',
        });
      }
    }

    setUploads((prev) => [...results, ...prev]);
    setIsUploading(false);
    await fetchStats();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  return (
    <div className="kb-tab">
      <div className="kb-header">
        <h2 className="kb-title">🧠 Knowledge Base</h2>
        <p className="kb-description">
          Upload your own documents (PDFs, text files, markdown) to give the AI writer
          access to your personal knowledge. The agent will use this context when
          generating and refining blogs.
        </p>
      </div>

      {/* Stats Card */}
      <div className="kb-stats-card">
        <div className="kb-stats-icon">🗄️</div>
        <div className="kb-stats-info">
          <div className="kb-stats-label">Vector Database</div>
          <div className="kb-stats-value">
            {stats === null
              ? 'Loading…'
              : `${stats.total_chunks.toLocaleString()} chunks indexed`}
          </div>
        </div>
        <div className={`kb-stats-badge ${stats?.total_chunks > 0 ? 'badge-active' : 'badge-empty'}`}>
          {stats?.total_chunks > 0 ? 'Ready' : 'Empty'}
        </div>
      </div>

      {/* Drop Zone */}
      <div
        id="kb-dropzone"
        className={`kb-dropzone ${isDragging ? 'kb-dropzone-active' : ''} ${isUploading ? 'kb-dropzone-loading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,text/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        {isUploading ? (
          <div className="kb-uploading">
            <span className="btn-spinner" style={{ width: 28, height: 28 }} />
            <p>Indexing documents…</p>
          </div>
        ) : (
          <>
            <div className="kb-dropzone-icon">{isDragging ? '📂' : '📄'}</div>
            <p className="kb-dropzone-text">
              {isDragging ? 'Drop files here' : 'Click or drag & drop files'}
            </p>
            <p className="kb-dropzone-hint">Supports PDF, TXT, Markdown</p>
          </>
        )}
      </div>

      {/* Upload History */}
      {uploads.length > 0 && (
        <div className="kb-uploads">
          <div className="kb-uploads-title">Recent Uploads</div>
          {uploads.map((u, i) => (
            <div key={i} className={`kb-upload-item ${u.status === 'error' ? 'kb-upload-error' : 'kb-upload-success'}`}>
              <span className="kb-upload-icon">{u.status === 'success' ? '✅' : '❌'}</span>
              <div className="kb-upload-details">
                <div className="kb-upload-name">{u.name}</div>
                <div className="kb-upload-meta">
                  {u.status === 'success'
                    ? `${u.chunks} chunks · ${u.chars?.toLocaleString()} chars`
                    : u.error}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tips */}
      <div className="kb-tips">
        <div className="kb-tips-title">💡 Tips</div>
        <ul className="kb-tips-list">
          <li>Upload your past blog posts to write <strong>in your own voice</strong></li>
          <li>Add technical docs to ground the AI in accurate facts</li>
          <li>Upload PDFs of research papers for citation-heavy blogs</li>
          <li>All documents are stored locally — your data stays private</li>
        </ul>
      </div>
    </div>
  );
}
