// Gemini API 代理，支持 OpenAI 格式适配。
// 1. OpenAI 适配: 转换 '/v1/chat/completions' 请求。
// 2. Gemini 代理: 透明转发其他所有请求。

export const config = {
  runtime: 'edge', // 启用 Edge Runtime 以获得最佳性能
};

// --- OpenAI/Gemini 格式转换工具 ---

/**
 * 将 OpenAI 消息转为 Gemini `contents` 和 `systemInstruction`。
 * @param {Array<Object>} messages OpenAI 消息数组。
 * @returns {{contents: Array<Object>, systemInstruction: Object|null}}
 */
function convertOpenAIMessagesToGemini(messages) {
  const contents = [];
  let systemInstruction = null;

  // 提取 system 消息作为 systemInstruction
  for (const message of messages) {
    if (message.role === 'system' && !systemInstruction) {
      systemInstruction = { parts: [{ text: message.content }] };
      continue;
    }
    
    const role = message.role === 'assistant' ? 'model' : 'user';
    
    // 合并连续的同角色消息
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts.push({ text: message.content });
    } else {
      contents.push({ role, parts: [{ text: message.content }] });
    }
  }

  return { contents, systemInstruction };
}

/**
 * 创建一个 TransformStream，将 Gemini SSE 流转为 OpenAI SSE 流。
 * @returns {TransformStream}
 */
function createGeminiToOpenAIStream() {
  const sseRegex = /^data: (.*)\s*$/gm;
  let buffer = '';
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new TransformStream({
    async transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let match;
      while ((match = sseRegex.exec(buffer)) !== null) {
        try {
          if (match[1] === '[DONE]') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            return;
          }
          
          const geminiChunk = JSON.parse(match[1]);
          const text = geminiChunk?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          if (text) {
            const openAIChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: 'gemini-adapted',
              choices: [{
                index: 0,
                delta: { content: text },
                finish_reason: null,
              }],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
          }
        } catch (e) {
          console.error('转换流中解析JSON失败:', match[1], e);
        }
      }
      buffer = buffer.slice(sseRegex.lastIndex);
      sseRegex.lastIndex = 0;
    },
  });
}


// --- 主处理函数 ---

export default async function handler(request) {
  const url = new URL(request.url);

  // 路由 1: OpenAI 模型列表
  if (url.pathname.endsWith('/v1/models')) {
    console.log('接收到 OpenAI 模型列表请求。');
    return new Response(JSON.stringify({
      object: 'list',
      data: [
        { id: 'gemini-1.5-flash', object: 'model', created: Date.now(), owned_by: 'google' },
        { id: 'gemini-1.5-pro', object: 'model', created: Date.now(), owned_by: 'google' },
        { id: 'gemini-1.0-pro', object: 'model', created: Date.now(), owned_by: 'google' },
        { id: 'text-embedding-004', object: 'model', created: Date.now(), owned_by: 'google' },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 路由 2: OpenAI 格式适配
  if (url.pathname.endsWith('/v1/chat/completions')) {
    console.log('检测到 OpenAI 格式请求，启动适配模式。');
    try {
      const openAIRequestBody = await request.json();
      const { contents, systemInstruction } = convertOpenAIMessagesToGemini(openAIRequestBody.messages);
      
      const model = openAIRequestBody.model?.includes('gemini') 
        ? openAIRequestBody.model 
        : 'gemini-1.5-flash';

      const geminiRequestBody = {
        contents,
        systemInstruction,
        generationConfig: {
          temperature: openAIRequestBody.temperature,
          maxOutputTokens: openAIRequestBody.max_tokens,
          topP: openAIRequestBody.top_p,
          stopSequences: typeof openAIRequestBody.stop === 'string' ? [openAIRequestBody.stop] : openAIRequestBody.stop,
        },
      };

      const isStreaming = openAIRequestBody.stream === true;
      const endpoint = isStreaming ? 'streamGenerateContent' : 'generateContent';
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?alt=sse`;
      
      const geminiResponse = await fetchWithRetry(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': request.headers.get('x-goog-api-key') || request.headers.get('authorization')?.split(' ')[1],
        },
        body: JSON.stringify(geminiRequestBody),
      }, request.headers);

      // 非流式响应转换
      if (!isStreaming) {
        const geminiJson = await geminiResponse.json();
        const content = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const openAIResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gemini-adapted',
          choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
        return new Response(JSON.stringify(openAIResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 流式响应转换
      return new Response(geminiResponse.body.pipeThrough(createGeminiToOpenAIStream()), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });

    } catch (error) {
      console.error('OpenAI 适配器中发生错误:', error);
      return new Response(JSON.stringify({ error: '适配器内部错误: ' + error.message }), { status: 500 });
    }
  }

  // 路由 3: 原生 Gemini 透明代理 (默认)
  console.log('原生 Gemini 代理模式。');
  try {
    const pathname = url.pathname.replace(/^\/api/, '');
    const searchParams = new URLSearchParams(url.search);
    searchParams.delete('path');
    const search = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const targetUrl = `https://generativelanguage.googleapis.com${pathname}${search}`;

    console.log(`目标 URL: ${targetUrl}`);

    return await fetchWithRetry(targetUrl, {
      method: request.method,
      headers: {
        'Content-Type': request.headers.get('content-type'),
      },
      body: request.body,
      duplex: 'half',
    }, request.headers);

  } catch (error) {
    console.error('原生代理处理程序中发生意外错误:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}


/**
 * 带负载均衡和重试的 fetch。
 * @param {string} url 目标 URL
 * @param {object} options fetch 选项
 * @param {Headers} originalHeaders 原始请求头
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, originalHeaders) {
  const apiKeyHeader = originalHeaders.get('x-goog-api-key') || originalHeaders.get('authorization')?.split(' ')[1];
  if (!apiKeyHeader) {
    return new Response(JSON.stringify({ error: "缺少 'x-goog-api-key' 或 'Authorization' 请求头。" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const apiKeys = apiKeyHeader.split(',').map(k => k.trim()).filter(k => k);
  if (apiKeys.length === 0) {
    return new Response(JSON.stringify({ error: "请求头中未提供任何有效的 API 密钥。" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 随机打乱密钥以分配负载
  for (let i = apiKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [apiKeys[i], apiKeys[j]] = [apiKeys[j], apiKeys[i]];
  }

  let lastErrorBody = null;
  let lastStatus = 500;

  for (const key of apiKeys) {
    const requestOptions = { ...options };
    requestOptions.headers = new Headers(options.headers);
    requestOptions.headers.set('x-goog-api-key', key);

    console.log(`尝试使用密钥: ...${key.slice(-4)}`);

    try {
      const response = await fetch(url, requestOptions);

      if (response.ok) {
        console.log(`使用密钥 ...${key.slice(-4)} 成功`);
        return response;
      }

      // 4xx 错误，继续尝试下一个密钥
      if (response.status >= 400 && response.status < 500) {
        console.warn(`密钥 ...${key.slice(-4)} 失败，状态码 ${response.status}。正在尝试下一个密钥。`);
        lastErrorBody = await response.text();
        lastStatus = response.status;
        continue;
      }
      
      // 5xx 错误，快速失败
      console.error(`使用密钥 ...${key.slice(-4)} 发生不可重试的服务器错误: ${response.status}`);
      return response;

    } catch (error) {
      console.error(`使用密钥 ...${key.slice(-4)} 发生 Fetch 错误:`, error);
      lastErrorBody = (error instanceof Error) ? error.message : String(error);
      lastStatus = 500;
    }
  }

  console.error("所有 API 密钥均失败。返回最后记录的错误。");
  return new Response(lastErrorBody, { status: lastStatus });
}