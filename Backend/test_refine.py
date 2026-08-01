import requests
import json
import uuid

thread_id = str(uuid.uuid4())
payload = {
    "thread_id": thread_id,
    "message": "Change the title of the blog to: SUPER AI BLOG",
    "current_content": "# Old Title\n\nThis is an old blog.",
    "db_id": None
}

r = requests.post("http://127.0.0.1:8000/api/refine", json=payload, stream=True)
for line in r.iter_lines():
    if line:
        print(line.decode('utf-8'))
