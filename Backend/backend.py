from __future__ import annotations

import operator
import os
import re
import urllib.parse
import uuid
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
from typing import TypedDict, List, Optional, Literal, Annotated

# Disable Chroma telemetry and silence LangGraph Msgpack warnings
os.environ["CHROMA_TELEMETRY_IMPL"] = "none"
os.environ["ANONYMIZED_TELEMETRY"] = "false"
os.environ["LANGGRAPH_STRICT_MSGPACK"] = "false"

from pydantic import BaseModel, Field

from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from langgraph.checkpoint.memory import MemorySaver

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# Blog Writer (Analyzer → Router → (Research+RAG?) → Orchestrator
#              → Workers → Reducer → Editor → (loop or END))
# ============================================================


# -----------------------------
# 1) Schemas
# -----------------------------
class Task(BaseModel):
    id: int
    title: str
    goal: str = Field(..., description="One sentence describing what the reader should do/understand.")
    bullets: List[str] = Field(..., min_length=3, max_length=6)
    target_words: int = Field(..., description="Target words (120-550).")

    tags: List[str] = Field(default_factory=list)
    requires_research: bool = False
    requires_citations: bool = False
    requires_code: bool = False


class Plan(BaseModel):
    blog_title: str
    audience: str
    tone: str
    blog_kind: Literal["explainer", "tutorial", "news_roundup", "comparison", "system_design"] = "explainer"
    constraints: List[str] = Field(default_factory=list)
    tasks: List[Task]


class EvidenceItem(BaseModel):
    title: str
    url: str
    published_at: Optional[str] = None
    snippet: Optional[str] = None
    source: Optional[str] = None


class RouterDecision(BaseModel):
    needs_research: bool
    mode: Literal["closed_book", "hybrid", "open_book"]
    reason: str
    queries: List[str] = Field(default_factory=list)
    max_results_per_query: int = Field(5)


class EvidencePack(BaseModel):
    evidence: List[EvidenceItem] = Field(default_factory=list)


class EditorVerdict(BaseModel):
    approved: bool
    feedback: str = Field(default="", description="Actionable feedback for the writers if not approved.")
    quality_score: int = Field(default=5, ge=1, le=10, description="Score from 1-10.")


class State(TypedDict):
    topic: str
    mode: str
    needs_research: bool
    queries: List[str]
    evidence: List[EvidenceItem]
    plan: Optional[Plan]
    genre: str
    persona_prompt: str
    as_of: str
    recency_days: int
    sections: Annotated[List[tuple], operator.add]
    merged_md: str
    final: str
    editor_feedback: str
    revision_count: int
    messages: Annotated[List[BaseMessage], operator.add]


# -----------------------------
# 2) LLM
# -----------------------------
import os
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

# Priority order:
#   1. HuggingFace (production — set HUGGINGFACEHUB_API_TOKEN)
#   2. Groq        (local dev fallback — set GROQ_API_KEY, free at console.groq.com)
#   3. Ollama      (fully offline fallback — no key needed)
hf_token = os.getenv("HUGGINGFACEHUB_API_TOKEN")
groq_api_key = os.getenv("GROQ_API_KEY")

if hf_token:
    # ✅ PRODUCTION: HuggingFace Inference API
    llm = ChatOpenAI(
        model="Qwen/Qwen2.5-7B-Instruct",
        base_url="https://api-inference.huggingface.co/v1/",
        api_key=hf_token,
        temperature=0.1,
        max_tokens=2048,
        max_retries=5,
        timeout=120.0,
    )
elif groq_api_key:
    # 🔧 LOCAL DEV FALLBACK: Groq (fast, free, works when HF is blocked locally)
    llm = ChatOpenAI(
        model="llama-3.1-8b-instant",
        base_url="https://api.groq.com/openai/v1",
        api_key=groq_api_key,
        temperature=0.1,
        max_tokens=2048,
        max_retries=3,
        timeout=60.0,
    )
else:
    # 💻 OFFLINE FALLBACK: Local Ollama
    llm = ChatOllama(model="qwen2.5:7b", temperature=0)

# -----------------------------
# 3) RAG - ChromaDB Vector Store
# -----------------------------
_CHROMA_DIR = str(Path(__file__).parent / "chroma_db")

def _get_chroma_collection():
    import chromadb
    from chromadb.config import Settings
    from chromadb.utils import embedding_functions
    client = chromadb.PersistentClient(
        path=_CHROMA_DIR,
        settings=Settings(anonymized_telemetry=False)
    )
    ef = embedding_functions.OllamaEmbeddingFunction(
        url="http://localhost:11434/api/embeddings",
        model_name="nomic-embed-text",
    )
    collection = client.get_or_create_collection(
        name="blog_knowledge_base",
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )
    return collection


def rag_search(query: str, n_results: int = 5) -> List[dict]:
    try:
        collection = _get_chroma_collection()
        if collection.count() == 0:
            return []
        results = collection.query(query_texts=[query], n_results=min(n_results, collection.count()))
        docs = []
        for i, doc in enumerate(results.get("documents", [[]])[0]):
            meta = (results.get("metadatas", [[]])[0] or [{}])[i] if results.get("metadatas") else {}
            docs.append({
                "title": meta.get("source", "Knowledge Base"),
                "url": meta.get("url", "local://knowledge-base"),
                "snippet": doc[:500],
                "published_at": meta.get("date"),
                "source": "knowledge_base",
            })
        return docs
    except Exception:
        return []


def ingest_document(text: str, source_name: str, url: str = "") -> int:
    try:
        collection = _get_chroma_collection()
        chunk_size, overlap = 500, 50
        chunks = []
        for i in range(0, len(text), chunk_size - overlap):
            chunk = text[i:i + chunk_size].strip()
            if chunk:
                chunks.append(chunk)

        ids = [f"{source_name}_{i}_{uuid.uuid4().hex[:8]}" for i in range(len(chunks))]
        metadatas = [{"source": source_name, "url": url, "chunk": i} for i in range(len(chunks))]
        collection.add(documents=chunks, ids=ids, metadatas=metadatas)
        return len(chunks)
    except Exception:
        return 0


def get_kb_stats() -> dict:
    try:
        collection = _get_chroma_collection()
        count = collection.count()
        return {"total_chunks": count, "status": "ready"}
    except Exception as e:
        return {"total_chunks": 0, "status": str(e)}


# -----------------------------
# 4) Analyzer (Dynamic Prompting)
# -----------------------------
ANALYZER_SYSTEM = """You are an expert genre classifier and persona generator for a blogging agent.
Given a blog topic, determine its genre (e.g., Technical, Fictional, Research, Lifestyle, Opinion, Tutorial) and generate a specific instruction set (persona prompt) for the writer.

Crucially: If the topic is technical or programming-related, the persona prompt MUST instruct the writer to include relevant code snippets and pseudocode.
For fictional topics, instruct the writer to use creative storytelling.

Output JSON with two keys:
1. "genre": short string (e.g., "Technical", "Fictional")
2. "persona_prompt": a paragraph of instructions for the writer node."""

def analyzer_node(state: State) -> dict:
    topic = state["topic"]
    messages_in = [
        SystemMessage(content=ANALYZER_SYSTEM),
        HumanMessage(content=f"Topic: {topic}")
    ]
    resp = llm.with_structured_output(
        schema={
            "title": "AnalyzerResponse",
            "type": "object", 
            "properties": {
                "genre": {"type": "string"}, 
                "persona_prompt": {"type": "string"}
            }, 
            "required": ["genre", "persona_prompt"]
        }
    ).invoke(messages_in)

    return {
        "genre": resp.get("genre", "Blog"),
        "persona_prompt": resp.get("persona_prompt", "Write a high-quality blog post."),
        "editor_feedback": "",
        "revision_count": 0,
        "messages": [],
    }

# -----------------------------
# 5) Router
# -----------------------------
ROUTER_SYSTEM = """You are a routing module for a technical blog planner.

Decide whether web research is needed BEFORE planning.

Modes:
- closed_book (needs_research=false): evergreen concepts.
- hybrid (needs_research=true): evergreen + needs up-to-date examples/tools/models.
- open_book (needs_research=true): volatile weekly/news/pricing/policy.

If needs_research=true:
- Output 3-10 high-signal, scoped queries.
"""

def router_node(state: State) -> dict:
    decider = llm.with_structured_output(RouterDecision)
    decision = decider.invoke(
        [
            SystemMessage(content=ROUTER_SYSTEM),
            HumanMessage(content=f"Topic: {state['topic']}\nAs-of date: {state['as_of']}"),
        ]
    )

    if decision.mode == "open_book":
        recency_days = 7
    elif decision.mode == "hybrid":
        recency_days = 45
    else:
        recency_days = 3650

    return {
        "needs_research": decision.needs_research,
        "mode": decision.mode,
        "queries": decision.queries,
        "recency_days": recency_days,
    }

def route_next(state: State) -> str:
    return "research" if state["needs_research"] else "orchestrator"

# -----------------------------
# 6) Research (Tavily + RAG)
# -----------------------------
def _tavily_search(query: str, max_results: int = 5) -> List[dict]:
    if not os.getenv("TAVILY_API_KEY"):
        return []
    try:
        from langchain_community.tools.tavily_search import TavilySearchResults
        tool = TavilySearchResults(max_results=max_results)
        results = tool.invoke({"query": query})
        out: List[dict] = []
        for r in results or []:
            out.append({
                "title": r.get("title") or "",
                "url": r.get("url") or "",
                "snippet": r.get("content") or r.get("snippet") or "",
                "published_at": r.get("published_date") or r.get("published_at"),
                "source": r.get("source"),
            })
        return out
    except Exception:
        return []


def _iso_to_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None

RESEARCH_SYSTEM = """You are a research synthesizer.

Given raw web search results AND local knowledge base results, produce EvidenceItem objects.

Rules:
- Only include items with a non-empty url.
- Prefer relevant + authoritative sources.
- Prioritize local knowledge base items (source="knowledge_base") if highly relevant.
- Normalize published_at to ISO YYYY-MM-DD if reliably inferable; else null.
- Keep snippets short.
- Deduplicate by URL.
"""

def research_node(state: State) -> dict:
    queries = (state.get("queries") or [])[:10]
    raw: List[dict] = []

    for q in queries:
        # 1) Query local RAG knowledge base FIRST
        rag_results = rag_search(q, n_results=3)
        raw.extend(rag_results)
        # 2) Augment with Tavily web search
        raw.extend(_tavily_search(q, max_results=6))

    if not raw:
        return {"evidence": []}

    extractor = llm.with_structured_output(EvidencePack)
    pack = extractor.invoke(
        [
            SystemMessage(content=RESEARCH_SYSTEM),
            HumanMessage(
                content=(
                    f"As-of date: {state['as_of']}\n"
                    f"Recency days: {state['recency_days']}\n\n"
                    f"Raw results:\n{raw}"
                )
            ),
        ]
    )

    dedup = {}
    for e in pack.evidence:
        if e.url:
            dedup[e.url] = e
    evidence = list(dedup.values())

    if state.get("mode") == "open_book":
        as_of = date.fromisoformat(state["as_of"])
        cutoff = as_of - timedelta(days=int(state["recency_days"]))
        evidence = [e for e in evidence if (d := _iso_to_date(e.published_at)) and d >= cutoff]

    return {"evidence": evidence}

# -----------------------------
# 7) Orchestrator (Plan)
# -----------------------------
ORCH_SYSTEM = """You are a senior technical writer and developer advocate.
Produce a highly actionable outline for a technical blog post.

Requirements:
- 5-9 tasks, each with goal + 3-6 bullets + target_words.
- Tags are flexible; do not force a fixed taxonomy.

Grounding:
- closed_book: evergreen, no evidence dependence.
- hybrid: use evidence for up-to-date examples.
- open_book: weekly/news roundup - set blog_kind="news_roundup".

Editor Feedback: If editor_feedback is non-empty, revise the plan to address it.
Output must match Plan schema.
"""

def orchestrator_node(state: State) -> dict:
    planner = llm.with_structured_output(Plan)
    mode = state.get("mode", "closed_book")
    evidence = state.get("evidence", [])
    editor_feedback = state.get("editor_feedback", "")

    forced_kind = "news_roundup" if mode == "open_book" else None
    feedback_section = f"\nEditor Feedback to Address:\n{editor_feedback}" if editor_feedback else ""

    plan = planner.invoke(
        [
            SystemMessage(content=ORCH_SYSTEM),
            HumanMessage(
                content=(
                    f"Topic: {state['topic']}\n"
                    f"Mode: {mode}\n"
                    f"As-of: {state['as_of']} (recency_days={state['recency_days']})\n"
                    f"{'Force blog_kind=news_roundup' if forced_kind else ''}\n"
                    f"{feedback_section}\n\n"
                    f"Evidence:\n{[e.model_dump() for e in evidence][:16]}"
                )
            ),
        ]
    )
    if forced_kind:
        plan.blog_kind = "news_roundup"

    return {"plan": plan, "sections": []}


# -----------------------------
# 8) Fanout
# -----------------------------
def fanout(state: State):
    assert state["plan"] is not None
    return [
        Send(
            "worker",
            {
                "task": task.model_dump(),
                "topic": state["topic"],
                "mode": state["mode"],
                "as_of": state["as_of"],
                "recency_days": state["recency_days"],
                "plan": state["plan"].model_dump(),
                "evidence": [e.model_dump() for e in state.get("evidence", [])],
                "persona_prompt": state.get("persona_prompt", ""),
                "editor_feedback": state.get("editor_feedback", ""),
            },
        )
        for task in state["plan"].tasks
    ]

# -----------------------------
# 9) Worker
# -----------------------------
def worker_node(payload: dict) -> dict:
    task = Task(**payload["task"])
    plan = Plan(**payload["plan"])
    evidence = [EvidenceItem(**e) for e in payload.get("evidence", [])]
    editor_feedback = payload.get("editor_feedback", "")

    feedback_instruction = (
        f"\n\nIMPORTANT - Address Editor Feedback: {editor_feedback}"
        if editor_feedback else ""
    )

    system_prompt = f"""You are an expert section writer for a blog.
{payload.get('persona_prompt', '')}

Goal: {task.goal}
Target words: ~{task.target_words}

Constraint: You MUST output exactly ONE section of markdown for this topic.{feedback_instruction}"""

    bullets_text = "\n- " + "\n- ".join(task.bullets)
    evidence_text = "\n".join(
        f"- {e.title} | {e.url} | {e.published_at or 'date:unknown'}"
        for e in evidence[:20]
    )

    section_md = llm.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(
                content=(
                    f"Blog title: {plan.blog_title}\n"
                    f"Section title: {task.title}\n"
                    f"Bullets:{bullets_text}\n\n"
                    f"Evidence (ONLY cite these URLs):\n{evidence_text}\n"
                )
            ),
        ]
    ).content.strip()

    return {"sections": [(task.id, section_md)]}

# ============================================================
# 10) Reducer
# ============================================================
def _safe_slug(title: str) -> str:
    s = title.strip().lower()
    s = re.sub(r"[^a-z0-9 _-]+", "", s)
    s = re.sub(r"\s+", "_", s).strip("_")
    return s or "blog"


def merge_content(state: State) -> dict:
    plan = state["plan"]
    if plan is None:
        raise ValueError("merge_content called without plan.")
    ordered_sections = [md for _, md in sorted(state["sections"], key=lambda x: x[0])]
    body = "\n\n".join(ordered_sections).strip()
    merged_md = f"# {plan.blog_title}\n\n{body}\n"
    return {"merged_md": merged_md, "genre": state.get("genre", "Blog")}


def finalize_output(state: State) -> dict:
    plan = state["plan"]
    assert plan is not None
    md = state["merged_md"]
    filename = f"{_safe_slug(plan.blog_title)}.md"
    Path(filename).write_text(md, encoding="utf-8")
    return {"final": md, "genre": state.get("genre", "Blog")}


reducer_graph = StateGraph(State)
reducer_graph.add_node("merge_content", merge_content)
reducer_graph.add_node("finalize_output", finalize_output)
reducer_graph.add_edge(START, "merge_content")
reducer_graph.add_edge("merge_content", "finalize_output")
reducer_graph.add_edge("finalize_output", END)
reducer_subgraph = reducer_graph.compile()

# ============================================================
# 11) Editor / Critic Node
# ============================================================
EDITOR_SYSTEM = """You are a senior editor and fact-checker reviewing a blog post draft.

Evaluate the blog for:
1. Flow and coherence (does it read naturally from section to section?)
2. Tone consistency (does it match the intended tone throughout?)
3. Hallucination risk (are there vague, unsupported, or suspicious claims?)
4. Completeness (does it cover the topic adequately?)

Scoring (1-10):
- 7+: Approve. The blog is ready to publish.
- Below 7: Reject. Provide specific, actionable feedback for the writers to improve it.

Output must match the EditorVerdict schema.
"""

MAX_REVISIONS = 2

def editor_node(state: State) -> dict:
    merged_md = state.get("merged_md", "")
    plan = state.get("plan")
    revision_count = state.get("revision_count", 0)

    if revision_count >= MAX_REVISIONS:
        return {"editor_feedback": "", "revision_count": revision_count}

    judge = llm.with_structured_output(EditorVerdict)
    verdict = judge.invoke(
        [
            SystemMessage(content=EDITOR_SYSTEM),
            HumanMessage(
                content=(
                    f"Topic: {state.get('topic', '')}\n"
                    f"Intended Tone: {plan.tone if plan else 'professional'}\n"
                    f"Intended Audience: {plan.audience if plan else 'general'}\n\n"
                    f"--- DRAFT BLOG ---\n{merged_md[:4000]}"
                )
            ),
        ]
    )

    if verdict.approved:
        return {"editor_feedback": "", "revision_count": revision_count}
    else:
        return {
            "editor_feedback": verdict.feedback,
            "revision_count": revision_count + 1,
            "sections": [],
        }


def route_after_editor(state: State) -> str:
    if state.get("editor_feedback") and state.get("revision_count", 0) <= MAX_REVISIONS:
        return "revise"
    return "done"


# ============================================================
# 12) Conversational Refinement Node
# ============================================================
REFINE_SYSTEM = """You are an expert blog editor making surgical edits to an existing blog post.

The user will give you a natural language instruction like:
- "Make the introduction funnier"
- "Expand section 3 with code examples"
- "Change the tone to be more casual"
- "Shorten the conclusion"

You MUST output ONLY the complete updated markdown blog, with the requested change applied.
Do NOT include any explanation or preamble - just the updated markdown.
"""

def refine_node(state: State) -> dict:
    messages = state.get("messages", [])
    merged_md = state.get("merged_md", "")

    if not messages:
        return {}

    last_human = next(
        (m for m in reversed(messages) if isinstance(m, HumanMessage)), None
    )
    if not last_human:
        return {}

    response = llm.invoke(
        [
            SystemMessage(content=REFINE_SYSTEM),
            HumanMessage(
                content=(
                    f"Current blog draft:\n\n{merged_md}\n\n"
                    f"User instruction: {last_human.content}"
                )
            ),
        ]
    )

    updated_md = response.content.strip()
    return {
        "merged_md": updated_md,
        "final": updated_md,
        "messages": [AIMessage(content="Blog updated based on your instruction.")],
    }


# ============================================================
# 13) Build main graph
# ============================================================
g = StateGraph(State)

g.add_node("analyzer", analyzer_node)
g.add_node("router", router_node)
g.add_node("research", research_node)
g.add_node("orchestrator", orchestrator_node)
g.add_node("worker", worker_node)
g.add_node("reducer", reducer_subgraph)
g.add_node("editor", editor_node)
g.add_node("refine", refine_node)

g.add_edge(START, "analyzer")
g.add_edge("analyzer", "router")
g.add_conditional_edges("router", route_next, {"research": "research", "orchestrator": "orchestrator"})
g.add_edge("research", "orchestrator")
g.add_conditional_edges("orchestrator", fanout, ["worker"])
g.add_edge("worker", "reducer")
g.add_edge("reducer", "editor")
g.add_conditional_edges(
    "editor",
    route_after_editor,
    {"revise": "orchestrator", "done": END},
)

memory = MemorySaver()
app = g.compile(checkpointer=memory)

refine_g = StateGraph(State)
refine_g.add_node("refine", refine_node)
refine_g.add_edge(START, "refine")
refine_g.add_edge("refine", END)
refine_app = refine_g.compile(checkpointer=memory)
