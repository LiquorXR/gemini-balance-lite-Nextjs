import os
import random
import asyncio
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, Response

# Vercel 会将这个文件部署为 Serverless Function
app = FastAPI()

# Google Gemini API 的基础 URL
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com"

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def proxy_to_gemini(request: Request, path: str):
    """
    一个 "catch-all" 路由，将所有请求代理到 Google Gemini API，
    并实现了 API 密钥的负载均衡和故障转移。
    """
    print(f"传入请求: /{path}?{request.query_params}")

    # 1. 从请求头中获取 API 密钥列表
    api_key_header = request.headers.get('x-goog-api-key', '')
    api_keys = [key.strip() for key in api_key_header.split(',') if key.strip()]

    if not api_keys:
        # 如果请求头中没有，尝试从环境变量中获取
        env_keys = os.environ.get('GOOGLE_API_KEYS', '')
        api_keys = [key.strip() for key in env_keys.split(',') if key.strip()]

    if not api_keys:
        return Response(content='{"error": "未提供 API 密钥。请在 \'x-goog-api-key\' 请求头或 GOOGLE_API_KEYS 环境变量中设置。"}', status_code=400, media_type="application/json")

    # 随机打乱密钥顺序以实现负载均衡
    random.shuffle(api_keys)

    # 2. 构建目标 URL
    # 我们不再需要从查询参数中删除 'key' 或 'path'，因为我们直接构建新的查询参数
    target_url = f"{GEMINI_API_BASE_URL}/{path}?{request.query_params}"
    print(f"目标 URL: {target_url}")

    # 3. 准备请求头
    # 过滤掉 Vercel 添加的或与主机相关的头信息
    excluded_headers = [
        'host', 'x-real-ip', 'x-forwarded-for', 'x-forwarded-proto',
        'x-vercel-id', 'x-vercel-deployment-url', 'x-vercel-proxied-for',
        'x-goog-api-key' # 我们将手动在循环中设置
    ]
    headers = {k: v for k, v in request.headers.items() if k.lower() not in excluded_headers}
    
    # 设置固定的 User-Agent
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) CherryStudio/1.5.1 Chrome/134.0.6998.205 Electron/35.6.0 Safari/537.36'

    # 4. 循环尝试密钥并发起请求
    last_error = None
    last_status = 500

    async with httpx.AsyncClient() as client:
        for key in api_keys:
            print(f"尝试使用密钥: ...{key[-4:]}")
            headers['x-goog-api-key'] = key
            
            try:
                # 检查是否为流式请求
                is_streaming = "stream" in path.lower()

                if is_streaming:
                    # 处理流式响应
                    req = client.build_request(
                        method=request.method,
                        url=target_url,
                        headers=headers,
                        content=request.stream(),
                    )
                    r = await client.send(req, stream=True)

                    if r.status_code == 200:
                        print(f"使用密钥 ...{key[-4:]} 成功 (流式)")
                        return StreamingResponse(r.aiter_bytes(), status_code=r.status_code, media_type=r.headers.get("content-type"), headers=dict(r.headers))
                else:
                    # 处理非流式响应
                    response = await client.request(
                        method=request.method,
                        url=target_url,
                        headers=headers,
                        content=await request.body()
                    )
                    if response.status_code < 400:
                        print(f"使用密钥 ...{key[-4:]} 成功")
                        # 过滤掉与分块传输相关的头信息
                        response_headers = {k: v for k, v in response.headers.items() if k.lower() not in ['content-encoding', 'transfer-encoding']}
                        return Response(content=response.content, status_code=response.status_code, headers=response_headers, media_type=response.headers.get("content-type"))

                # 如果是客户端错误 (4xx)，记录并尝试下一个密钥
                if 400 <= response.status_code < 500:
                    print(f"密钥 ...{key[-4:]} 失败，状态码 {response.status_code}。正在尝试下一个密钥。")
                    last_error = await response.aread()
                    last_status = response.status_code
                    await response.aclose()
                    continue
                
                # 如果是服务器错误 (5xx)，直接返回，因为重试可能无效
                print(f"使用密钥 ...{key[-4:]} 发生不可重试的服务器错误: {response.status_code}")
                return Response(content=await response.aread(), status_code=response.status_code, headers=dict(response.headers))

            except httpx.RequestError as e:
                error_message = f"无法连接到目标服务器: {e}"
                print(f"使用密钥 ...{key[-4:]} 访问 {target_url} 时发生 Fetch 错误: {error_message}")
                last_error = f'{{"error": "Proxy fetch error", "details": "{error_message}"}}'.encode('utf-8')
                last_status = 502 # 502 Bad Gateway 更适合这种情况
                continue # 网络错误，尝试下一个密钥

    # 如果所有密钥都失败了
    print("所有 API 密钥均失败。返回最后记录的错误。")
    return Response(content=last_error, status_code=last_status, media_type="application/json")