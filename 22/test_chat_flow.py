import requests
import json

BASE_URL = "http://localhost:8001"
headers = {"Content-Type": "application/json"}

print("=== 测试完整聊天流程 ===")
print()

session_id = "test_session_python"

print("步骤1: 开始对话")
start_url = f"{BASE_URL}/api/chat/start?flow_id=2&session_id={session_id}"
r = requests.post(start_url)
data = r.json()
print(f"消息: {data['message']['content']}")
print(f"需要回答: {data['message']['is_question']}")
print()

print("步骤2: 自动继续（欢迎消息）")
body = {
    "flow_id": 2,
    "session_id": session_id,
    "current_node_id": "node_welcome",
    "answer": "",
    "collected_data": {}
}
r = requests.post(f"{BASE_URL}/api/chat/next", json=body)
data = r.json()
print(f"消息: {data['message']['content']}")
print(f"需要回答: {data['message']['is_question']}")
print(f"字段名: {data['message'].get('field_name')}")
print()

print("步骤3: 回答姓名: 赵六")
body = {
    "flow_id": 2,
    "session_id": session_id,
    "current_node_id": "node_name",
    "answer": "赵六",
    "collected_data": {}
}
r = requests.post(f"{BASE_URL}/api/chat/next", json=body)
data = r.json()
print(f"消息: {data['message']['content']}")
print(f"需要回答: {data['message']['is_question']}")
print()

print("步骤4: 回答邮箱: zhaoliu@test.com")
body = {
    "flow_id": 2,
    "session_id": session_id,
    "current_node_id": "node_email",
    "answer": "zhaoliu@test.com",
    "collected_data": {"name": "赵六"}
}
r = requests.post(f"{BASE_URL}/api/chat/next", json=body)
data = r.json()
print(f"消息: {data['message']['content']}")
print(f"对话完成: {data['is_completed']}")
print()

print("=== 查看所有提交数据 ===")
r = requests.get(f"{BASE_URL}/api/chat/submissions/2")
subs = r.json()
for sub in subs:
    print(f"ID: {sub['id']}, 时间: {sub['created_at']}")
    print(f"数据: {json.dumps(sub['data'], ensure_ascii=False)}")
    print("---")
