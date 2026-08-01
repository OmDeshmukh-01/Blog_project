import asyncio
from backend import refine_app
from langchain_core.messages import HumanMessage

async def main():
    thread_id = "test-db-id"
    config = {"configurable": {"thread_id": thread_id}}
    
    refinement_input = {
        "messages": [HumanMessage(content="Update it")],
        "db_id": 999,
        "merged_md": "# Original"
    }
    
    async for step in refine_app.astream(refinement_input, config=config, stream_mode="updates"):
        pass

    snapshot = refine_app.get_state(config)
    print("KEYS IN SNAPSHOT:", snapshot.values.keys())
    print("DB_ID IN SNAPSHOT:", snapshot.values.get("db_id"))

asyncio.run(main())
