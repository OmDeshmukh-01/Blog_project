/**
 * API client for the Blog Writer backend.
 * Handles SSE streaming for generation/refinement and REST calls.
 */

// In dev: Vite proxy or direct to 127.0.0.1:8000
// In production: nginx on same server proxies /api/* to FastAPI
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

/**
 * Stream blog generation via SSE.
 * @returns {function} abort function
 */
export function generateBlog({ topic, as_of }, onProgress, onDone, onError) {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, as_of }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              if (eventType === 'progress') {
                const keys = Object.keys(data);
                const nodeName = keys.length === 1 ? keys[0] : null;
                onProgress(nodeName, data);
              } else if (eventType === 'done') {
                onDone(data);
              } else if (eventType === 'error') {
                onError(data.message || 'Unknown error');
              }
            } catch {
              // Malformed JSON, skip
            }
            eventType = null;
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err.message || 'Network error');
    });

  return () => controller.abort();
}

/**
 * Stream conversational blog refinement via SSE.
 * @param {string} threadId - The thread_id from the previous generation
 * @param {string} message - Natural language edit instruction
 * @param {string} currentContent - The current markdown of the blog
 * @param {number|null} dbId - The database ID of the blog
 * @param {function} onProgress
 * @param {function} onDone - Called with { merged_md }
 * @param {function} onError
 * @returns {function} abort function
 */
export function refineBlog(threadId, message, currentContent, dbId, onProgress, onDone, onError) {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, message, current_content: currentContent, db_id: dbId }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              if (eventType === 'progress') {
                const keys = Object.keys(data);
                const nodeName = keys.length === 1 ? keys[0] : null;
                onProgress(nodeName, data);
              } else if (eventType === 'done') {
                onDone(data);
              } else if (eventType === 'error') {
                onError(data.message || 'Unknown error');
              }
            } catch {
              // skip
            }
            eventType = null;
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err.message || 'Network error');
    });

  return () => controller.abort();
}

/**
 * Upload a document to the RAG knowledge base.
 * @param {File} file - PDF or text file
 * @param {string} sourceName - Optional label for the source
 * @returns {Promise<{status, chunks_added, characters}>}
 */
export async function uploadDocument(file, sourceName = '') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source_name', sourceName || file.name);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Get knowledge base stats.
 * @returns {Promise<{total_chunks, status}>}
 */
export async function getKbStats() {
  try {
    const res = await fetch(`${API_BASE}/api/kb/stats`);
    if (!res.ok) return { total_chunks: 0, status: 'error' };
    return res.json();
  } catch {
    return { total_chunks: 0, status: 'offline' };
  }
}

/**
 * Fetch the list of past blogs from the database.
 */
export async function listBlogs() {
  try {
    const res = await fetch(`${API_BASE}/api/blogs`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Fetch the content of a specific blog by ID.
 */
export async function getBlog(id) {
  try {
    const res = await fetch(`${API_BASE}/api/blogs/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Delete a blog from the database by ID.
 */
export async function deleteBlog(id) {
  try {
    const res = await fetch(`${API_BASE}/api/blogs/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch {
    return false;
  }
}
