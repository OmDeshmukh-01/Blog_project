import asyncio
from backend import app as graph_app, refine_app
from langchain_core.messages import HumanMessage

async def main():
    thread_id = "test-thread-123"
    config = {"configurable": {"thread_id": thread_id}}
    
    # 1. Initialize state in graph_app as if it finished
    # We will just update state
    graph_app.update_state(config, {"topic": "test topic", "merged_md": "# Original"})
    
    # 2. Now run refine_app on the same thread
    refinement_input = {"messages": [HumanMessage(content="Update it")]}
    async for step in refine_app.astream(refinement_input, config=config, stream_mode="updates"):
        print(step)

asyncio.run(main())
