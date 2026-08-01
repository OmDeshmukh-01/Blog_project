import { useState, useRef, useEffect } from 'react';
import { refineBlog } from '../api';

export default function ChatSidebar({ threadId, currentContent, dbId, onRefined, isVisible }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isRefining, setIsRefining] = useState(false);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isVisible && threadId && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: '✨ Blog generated! You can now ask me to refine it. Try:\n- "Make the intro more engaging"\n- "Add code examples to section 2"\n- "Shorten the conclusion"\n- "Change the tone to casual"',
        },
      ]);
    }
  }, [isVisible, threadId]);

  const handleSend = () => {
    if (!input.trim() || isRefining || !threadId) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsRefining(true);

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '⏳ Applying your changes…', loading: true },
    ]);

    const abort = refineBlog(
      threadId,
      userMsg,
      currentContent,
      dbId,
      // onProgress
      (nodeName) => {
        if (nodeName) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.loading) {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: `⚙️ Processing: ${nodeName}…`,
              };
            }
            return updated;
          });
        }
      },
      // onDone
      (result) => {
        setIsRefining(false);
        const updatedMd = result?.merged_md || result?.final || '';
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.loading) {
            updated[lastIdx] = {
              role: 'assistant',
              content: updatedMd
                ? '✅ Done! The blog has been updated based on your instruction.'
                : '⚠️ Refinement completed but no content was returned.',
              loading: false,
            };
          }
          return updated;
        });
        if (updatedMd && onRefined) {
          onRefined(updatedMd);
        }
      },
      // onError
      (errorMsg) => {
        setIsRefining(false);
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.loading) {
            updated[lastIdx] = {
              role: 'assistant',
              content: `❌ Error: ${errorMsg}`,
              loading: false,
              error: true,
            };
          }
          return updated;
        });
      }
    );

    abortRef.current = abort;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <span className="chat-sidebar-icon">💬</span>
        <div>
          <div className="chat-sidebar-title">Refine with AI</div>
          <div className="chat-sidebar-sub">
            {threadId ? 'Session active' : 'Generate a blog first'}
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !threadId && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🤖</div>
            <p>Generate a blog first, then come back here to refine it through conversation.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-message ${msg.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'} ${msg.error ? 'chat-message-error' : ''}`}
          >
            <div className="chat-message-bubble">
              {msg.content.split('\n').map((line, j) => (
                <span key={j}>
                  {line}
                  {j < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={
            threadId
              ? 'e.g. "Make the intro more engaging"…'
              : 'Generate a blog first…'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!threadId || isRefining}
          rows={2}
        />
        <button
          id="chat-send-btn"
          className={`btn btn-primary chat-send-btn ${isRefining ? 'btn-loading' : ''}`}
          onClick={handleSend}
          disabled={!threadId || !input.trim() || isRefining}
        >
          {isRefining ? <span className="btn-spinner" /> : '↑'}
        </button>
      </div>
    </div>
  );
}
