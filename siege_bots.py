import time
import requests  # 如果没有请 pip install requests

# 模拟机器人攻击
TARGET_URL = "http://localhost:3000/api/shield-score"
WALLET_ADDRESS = "11111111111111111111111111111111"

print("🔥 机器人军团开始冲锋：低熵、高频攻击启动...")

for i in range(100):
    # 精准的 50ms 间隔，模拟“非人”的精密感
    start_time = time.time()

    response = requests.post(TARGET_URL, json={
        "wallet": WALLET_ADDRESS,
        "mode": "guest",  # 走游客通道，承受指数通胀
        "reclaim_attestations": []
    })

    data = response.json()
    print(
        f"第 {i} 次尝试 | HTTP: {response.status_code} | "
        f"dignity_score: {data.get('dignity_score')} | error: {data.get('error')}"
    )

    # 强制对齐 50ms，制造低熵特征
    elapsed = time.time() - start_time
    time.sleep(max(0, 0.05 - elapsed))
