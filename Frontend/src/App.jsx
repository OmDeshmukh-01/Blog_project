import { useState, useCallback, useRef } from 'react';
import { generateBlog } from './api';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import PlanTab from './components/PlanTab';
import EvidenceTab from './components/EvidenceTab';
import PreviewTab from './components/PreviewTab';
import LogsTab from './components/LogsTab';
import ProgressBar from './components/ProgressBar';
import ChatSidebar from './components/ChatSidebar';
import KnowledgeBaseTab from './components/KnowledgeBaseTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('plan');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [currentNode, setCurrentNode] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const [progressSummary, setProgressSummary] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const abortRef = useRef(null);

  const addLog = useCallback((node, message) => {
    setLogs((prev) => [...prev, { node, message, time: new Date().toLocaleTimeString() }]);
  }, []);

  const handleGenerate = useCallback(
    (params, loadedResult) => {
      // If a pre-loaded result is passed (from past blogs), just set it
      if (loadedResult) {
        setResult(loadedResult);
        setIsComplete(true);
        setCurrentNode(null);
        setIsGenerating(false);
        setActiveTab('preview');
        setThreadId(loadedResult.thread_id || crypto.randomUUID());
        addLog(null, 'Loaded past blog');
        return;
      }

      if (!params || !params.topic) return;

      // Reset state
      setIsGenerating(true);
      setResult(null);
      setLogs([]);
      setCurrentNode(null);
      setIsComplete(false);
      setProgressSummary(null);
      setThreadId(null);
      setActiveTab('plan');

      addLog(null, `Starting generation: "${params.topic}"`);

      const abort = generateBlog(
        params,
        // onProgress
        (nodeName, payload) => {
          if (nodeName) {
            setCurrentNode(nodeName);
            addLog(nodeName, `Node "${nodeName}" produced output`);
          }

          // Build live summary from progress data
          const inner = nodeName ? payload[nodeName] : payload;
          if (inner && typeof inner === 'object') {
            setProgressSummary((prev) => {
              const next = { ...prev };
              if (inner.mode) next.mode = inner.mode;
              if (inner.evidence) next.evidenceCount = inner.evidence.length;
              if (inner.plan?.tasks) next.taskCount = inner.plan.tasks.length;
              if (inner.sections) next.sectionsDone = (prev?.sectionsDone || 0) + (inner.sections?.length || 0);
              return next;
            });

            // Accumulate partial results
            setResult((prev) => {
              const merged = { ...(prev || {}) };
              if (inner.plan) merged.plan = inner.plan;
              if (inner.evidence) merged.evidence = inner.evidence;
              if (inner.final) merged.final = inner.final;
              if (inner.mode) merged.mode = inner.mode;
              if (inner.genre) merged.genre = inner.genre;
              return merged;
            });
          }
        },
        // onDone
        (finalResult) => {
          setResult(finalResult);
          if (finalResult.thread_id) setThreadId(finalResult.thread_id);
          setIsGenerating(false);
          setIsComplete(true);
          setCurrentNode(null);
          addLog(null, '✅ Generation complete');
          // Auto-switch to preview
          setActiveTab('preview');
        },
        // onError
        (errorMsg) => {
          setIsGenerating(false);
          setIsComplete(false);
          setCurrentNode(null);
          addLog(null, `❌ Error: ${errorMsg}`);
        }
      );

      abortRef.current = abort;
    },
    [addLog]
  );

  const renderTab = () => {
    switch (activeTab) {
      case 'plan':
        return <PlanTab result={result} />;
      case 'evidence':
        return <EvidenceTab result={result} />;
      case 'preview':
        return <PreviewTab result={result} />;
      case 'knowledge':
        return <KnowledgeBaseTab />;
      case 'logs':
        return <LogsTab logs={logs} />;
      default:
        return null;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar onGenerate={handleGenerate} isGenerating={isGenerating} />

      <main className="main-content">
        <ProgressBar
          currentNode={currentNode}
          isComplete={isComplete}
          summary={progressSummary}
        />

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {renderTab()}
      </main>

      <ChatSidebar 
        threadId={threadId} 
        currentContent={result?.final || result?.content || ''}
        dbId={result?.id || result?.db_id || null}
        isVisible={activeTab === 'preview'} 
        onRefined={(newMd) => setResult(prev => ({ ...prev, merged_md: newMd, final: newMd, content: newMd, plan: null }))}
      />
    </div>
  );
}
