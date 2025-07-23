// 此路由会将请求代理到 Google Gemini API。
// 它支持跨多个 API 密钥的负载均衡和智能重试。

export const config = {
  runtime: 'edge', // 使用 Edge Runtime 以获得最佳性能
};

export default async function handler(request) {
  try {
    // 1. 克隆请求以允许 body 被多次读取
    const clonedRequest = request.clone();
    
    // 2. 从传入请求中获取路径和搜索参数。
    const url = new URL(request.url);
    let pathname = url.pathname.replace(/^\/api/, ''); // 移除 /api 前缀
    const searchParams = new URLSearchParams(url.search);
    searchParams.delete('path');
    const search = searchParams.toString() ? `?${searchParams.toString()}` : '';

    console.log(`传入请求: ${url.pathname}${url.search}`);

    // 3. 智能判断请求类型 (OpenAI vs. Gemini)
    let isPostRequest = request.method === 'POST';
    let isOpenAIRequest = false;
    if (isPostRequest) {
      try {
        const body = await clonedRequest.json();
        // OpenAI 请求体通常包含 'messages' 字段
        if (body && Array.isArray(body.messages)) {
          isOpenAIRequest = true;
        }
      } catch (e) {
        // 如果 JSON 解析失败，则假定为非 OpenAI 请求
        console.warn("无法解析请求体 JSON，假定为原生 Gemini 请求。");
      }
    }
    
    // 如果是 OpenAI 请求，则重写路径以指向兼容端点
    if (isOpenAIRequest) {
      // 这是一个常见的 OpenAI 端点，可以根据需要扩展
      pathname = '/v1beta/openai/chat/completions';
      console.log(`检测到 OpenAI 兼容请求，路径重写为: ${pathname}`);
    }

    // 4. 构建目标 Google Gemini API 的 URL。
    const targetDomain = 'https://generativelanguage.googleapis.com';
    const targetUrl = `${targetDomain}${pathname}${search}`;
    
    console.log(`目标 URL: ${targetUrl}`);
    console.log(`请求类型: ${isOpenAIRequest ? 'OpenAI 兼容模式' : '原生 Gemini'}`);

    // 5. 为出站请求创建新的请求头。
    const headers = new Headers();
    if (request.headers.has('content-type')) {
      headers.set('content-type', request.headers.get('content-type'));
    }

    // 6. 处理 API 密钥 (支持 'Authorization' 和 'x-goog-api-key')
    let apiKeys = [];
    const authHeader = request.headers.get('authorization');
    const apiKeyHeader = request.headers.get('x-goog-api-key');

    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token) apiKeys.push(token);
    }
    if (apiKeyHeader) {
      apiKeys.push(...apiKeyHeader.split(',').map(k => k.trim()).filter(k => k));
    }
    apiKeys = [...new Set(apiKeys)]; // 去重

    if (apiKeys.length === 0) {
      const errorMsg = "请求中未提供 API 密钥。请在 'Authorization' (Bearer token) 或 'x-goog-api-key' 请求头中提供密钥。";
      return new Response(JSON.stringify({ error: errorMsg }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 7. 随机打乱密钥以实现负载均衡
    for (let i = apiKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [apiKeys[i], apiKeys[j]] = [apiKeys[j], apiKeys[i]];
    }

    let lastErrorBody = null;
    let lastStatus = 500;

    // 8. 遍历密钥并尝试请求，失败时重试。
    for (const key of apiKeys) {
      headers.set('x-goog-api-key', key);
      console.log(`尝试使用密钥: ...${key.slice(-4)}`);

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: headers,
          body: request.body, // 使用原始请求的 body
          duplex: 'half',
        });

        // 如果请求成功，立即返回响应。
        if (response.ok) {
          console.log(`使用密钥 ...${key.slice(-4)} 成功`);
          return response;
        }

        // 如果错误与密钥相关 (4xx)，则存储错误并尝试下一个密钥。
        if (response.status >= 400 && response.status < 500) {
          console.warn(`密钥 ...${key.slice(-4)} 失败，状态码 ${response.status}。正在尝试下一个密钥。`);
          lastErrorBody = await response.text();
          lastStatus = response.status;
          continue; // 尝试下一个密钥
        }
        
        // 对于与密钥无关的服务器错误 (5xx)，快速失败，因为这很可能是 Google 方面的问题。
        console.error(`使用密钥 ...${key.slice(-4)} 发生不可重试的服务器错误: ${response.status}`);
        return response;

      } catch (error) {
        console.error(`使用密钥 ...${key.slice(-4)} 发生 Fetch 错误:`, error);
        lastErrorBody = (error instanceof Error) ? error.message : String(error);
        lastStatus = 500; // 网络错误是内部服务器错误
        // 如果发生网络错误，则继续使用下一个密钥
      }
    }

    // 如果所有密钥都失败了，则返回最后记录的错误。
    console.error("所有 API 密钥均失败。返回最后记录的错误。");
    return new Response(lastErrorBody, { status: lastStatus });

  } catch (error) {
    console.error('代理处理程序中发生意外错误:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message, error.stack);
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}