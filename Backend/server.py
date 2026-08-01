"""
FastAPI server wrapping the LangGraph blog-writer backend.

Endpoints:
  POST /api/generate          - Stream blog generation via SSE (returns thread_id)
  POST /api/refine            - Stream conversational refinement via SSE
  POST /api/upload            - Upload a document to the RAG knowledge base
  GET  /api/kb/stats          - Get knowledge base stats
  GET  /api/blogs             - List past blogs from DB
  GET  /api/blogs/{id}        - Read a specific blog
  DELETE /api/blogs/{id}      - Delete a blog
"""
from __future__ import annotations

import io
import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Request, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from langchain_core.messages import HumanMessage

# Import the compiled LangGraph app + RAG helpers
from backend import app as graph_app, refine_app, ingest_document, get_kb_stats
import models
from database import engine, get_db

# Create DB tables
models.Base.metadata.create_all(bind=engine)

# --- FastAPI App ---
fastapi_app = FastAPI(title="Blog Writer API", version="2.0.0")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request / Response Models ---
class GenerateRequest(BaseModel):
    topic: str
    as_of: str = "2024-05-20"


class RefineRequest(BaseModel):
    thread_id: str
    message: str  # e.g. "Make the introduction funnier"
    current_content: Optional[str] = None
    db_id: Optional[int] = None


# --- Helpers ---
def _serialize(obj: Any) -> Any:
    """Make an object JSON-serializable."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "content") and hasattr(obj, "type"):
        # BaseMessage (HumanMessage, AIMessage, etc.)
        return {"type": obj.type, "content": obj.content}
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_serialize(i) for i in obj]
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


# --- SSE Generate Endpoint ---
@fastapi_app.post("/api/generate")
async def generate_blog(request: Request, db: Session = Depends(get_db)):
    """
    Streams blog generation progress as Server-Sent Events.
    Assigns a persistent thread_id for later conversational refinement.
    Events:
      - event: progress  -> partial state update from a graph node
      - event: done      -> final complete result (includes thread_id)
      - event: error     -> error message
    """
    body = await request.json()
    req = GenerateRequest(**body)
    thread_id = str(uuid.uuid4())

    inputs: Dict[str, Any] = {
        "topic": req.topic.strip(),
        "mode": "",
        "needs_research": False,
        "queries": [],
        "evidence": [],
        "plan": None,
        "as_of": req.as_of,
        "recency_days": 7,
        "sections": [],
        "merged_md": "",
        "final": "",
        "editor_feedback": "",
        "revision_count": 0,
        "messages": [],
        "genre": "",
        "persona_prompt": "",
    }

    config = {"configurable": {"thread_id": thread_id}}

    async def event_stream():
        try:
            final_state = dict(inputs)
            async for step in graph_app.astream(inputs, config=config, stream_mode="updates"):
                for node_name, state_update in step.items():
                    if isinstance(state_update, dict):
                        final_state.update(state_update)

                serialized = _serialize(step)
                data = json.dumps(serialized, default=str)
                yield f"event: progress\ndata: {data}\n\n"

            final = final_state

            genre = final.get("genre", "Blog")
            plan_obj = final.get("plan")
            if isinstance(plan_obj, dict):
                blog_title = plan_obj.get("blog_title", req.topic)
            elif hasattr(plan_obj, "blog_title"):
                blog_title = plan_obj.blog_title
            else:
                blog_title = req.topic

            merged_md = final.get("merged_md", "")

            if merged_md:
                new_blog = models.Blog(
                    title=blog_title,
                    topic=req.topic,
                    genre=genre,
                    content=merged_md,
                    thread_id=thread_id
                )
                db.add(new_blog)
                db.commit()
                db.refresh(new_blog)
                final["db_id"] = new_blog.id

            # Attach thread_id so the frontend can use it for refinement
            final["thread_id"] = thread_id

            serialized = _serialize(final)
            data = json.dumps(serialized, default=str)
            yield f"event: done\ndata: {data}\n\n"

        except Exception as e:
            error_data = json.dumps({"message": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- Conversational Refinement Endpoint ---
@fastapi_app.post("/api/refine")
async def refine_blog(request: Request, db: Session = Depends(get_db)):
    """
    Streams conversational refinement of an existing blog post using LangGraph
    persistent thread memory. The thread_id links this request to the previous
    generation session, giving the agent full context.

    Events:
      - event: progress  -> node streaming update
      - event: done      -> updated blog content
      - event: error     -> error message
    """
    body = await request.json()
    req = RefineRequest(**body)

    config = {"configurable": {"thread_id": req.thread_id}}

    refinement_input = {
        "messages": [HumanMessage(content=req.message)],
    }
    
    if req.current_content:
        refinement_input["merged_md"] = req.current_content
    if req.db_id:
        refinement_input["db_id"] = req.db_id

    async def event_stream():
        try:
            final_state = {}
            async for step in refine_app.astream(
                refinement_input,
                config=config,
                stream_mode="updates",
            ):
                for node_name, state_update in step.items():
                    if isinstance(state_update, dict):
                        final_state.update(state_update)

                serialized = _serialize(step)
                data = json.dumps(serialized, default=str)
                yield f"event: progress\ndata: {data}\n\n"

            # Update the blog in DB if we have a db_id in request
            updated_md = final_state.get("merged_md", "")
            if updated_md and req.db_id:
                blog = db.query(models.Blog).filter(models.Blog.id == req.db_id).first()
                if blog:
                    blog.content = updated_md
                    db.commit()

            serialized = _serialize(final_state)
            data = json.dumps(serialized, default=str)
            yield f"event: done\ndata: {data}\n\n"

        except Exception as e:
            error_data = json.dumps({"message": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- RAG Upload Endpoint ---
@fastapi_app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...),
    source_name: str = Form(default=""),
):
    """
    Upload a document (PDF or plain text) to the local ChromaDB knowledge base.
    The document will be chunked and indexed for use in future blog generations.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    filename = file.filename
    source = source_name or filename
    content = await file.read()
    text = ""

    if filename.lower().endswith(".pdf"):
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to parse PDF: {e}")
    else:
        # Treat as plain text / markdown
        try:
            text = content.decode("utf-8").strip()
        except UnicodeDecodeError:
            text = content.decode("latin-1").strip()

    if not text:
        raise HTTPException(status_code=422, detail="Document appears to be empty or unreadable.")

    chunks_added = ingest_document(text, source_name=source, url=f"local://{filename}")

    return {
        "status": "success",
        "filename": filename,
        "source": source,
        "chunks_added": chunks_added,
        "characters": len(text),
    }


# --- Knowledge Base Stats Endpoint ---
@fastapi_app.get("/api/kb/stats")
async def kb_stats():
    """Returns stats about the local knowledge base."""
    return get_kb_stats()


# --- Past Blogs Endpoints ---
@fastapi_app.get("/api/blogs")
async def list_blogs(db: Session = Depends(get_db)):
    """Returns a list of all past blogs from the database."""
    blogs = db.query(models.Blog).order_by(models.Blog.created_at.desc()).all()
    return [
        {
            "id": b.id,
            "title": b.title,
            "topic": b.topic,
            "genre": b.genre,
            "created_at": b.created_at.isoformat(),
            "thread_id": b.thread_id,
        }
        for b in blogs
    ]

@fastapi_app.get("/api/blogs/{blog_id}")
async def get_blog(blog_id: int, db: Session = Depends(get_db)):
    """Returns the full content of a specific blog by ID."""
    blog = db.query(models.Blog).filter(models.Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=404, detail="Blog not found")

    return {
        "id": blog.id,
        "title": blog.title,
        "topic": blog.topic,
        "genre": blog.genre,
        "content": blog.content,
        "thread_id": blog.thread_id,
        "created_at": blog.created_at.isoformat()
    }

@fastapi_app.delete("/api/blogs/{blog_id}")
async def delete_blog(blog_id: int, db: Session = Depends(get_db)):
    """Deletes a blog from the database."""
    blog = db.query(models.Blog).filter(models.Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=404, detail="Blog not found")

    db.delete(blog)
    db.commit()
    return {"status": "deleted", "id": blog_id}


# --- Run ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(fastapi_app, host="0.0.0.0", port=8000)
