// This route will proxy requests to the Google Gemini API.
// It supports load balancing and intelligent retries across multiple API keys.

export const config = {
  runtime: 'edge', // Use the Edge Runtime for best performance
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
  try {
    // 1. Get the path and search params from the incoming request.
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/^\/api/, ''); // remove /api prefix
    
    // The client might add a 'path' query parameter that duplicates the path.
    // We need to remove it to avoid sending a malformed URL to the target API.
    const searchParams = new URLSearchParams(url.search);
    searchParams.delete('path');
    const search = searchParams.toString() ? `?${searchParams.toString()}` : '';

    console.log(`Incoming request: ${url.pathname}${url.search}`);

    // 2. Construct the target URL for the Google Gemini API.
    const targetUrl = `https://generativelanguage.googleapis.com${pathname}${search}`;
    console.log(`Target URL: ${targetUrl}`);

    // 3. Create new headers for the outgoing request.
    const headers = new Headers();
    
    // Copy 'Content-Type' from the original request.
    if (request.headers.has('content-type')) {
      headers.set('content-type', request.headers.get('content-type'));
    }

    // 4. Handle the 'x-goog-api-key' for load balancing and retries.
    const apiKeyHeader = request.headers.get('x-goog-api-key');
    if (!apiKeyHeader) {
      return new Response(JSON.stringify({ error: "Missing 'x-goog-api-key' header." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const apiKeys = apiKeyHeader.split(',').map(k => k.trim()).filter(k => k);
    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: "No API keys provided in 'x-goog-api-key' header." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Shuffle the keys to ensure randomness and distribute load.
    for (let i = apiKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [apiKeys[i], apiKeys[j]] = [apiKeys[j], apiKeys[i]];
    }

  let lastErrorBody = null;
  let lastStatus = 500;

    // 5. Iterate through the keys and attempt the request, retrying on failure.
    for (const key of apiKeys) {
      headers.set('x-goog-api-key', key);
      console.log(`Attempting with key: ...${key.slice(-4)}`);

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: headers,
          body: request.body,
          duplex: 'half',
        });

        // If the request is successful, return the response immediately.
        if (response.ok) {
          console.log(`Success with key: ...${key.slice(-4)}`);
          return response;
        }

        // If the error is key-related (4xx), store it and try the next key.
        if (response.status >= 400 && response.status < 500) {
          console.warn(`Key ...${key.slice(-4)} failed with status ${response.status}. Trying next key.`);
          lastErrorBody = await response.text();
          lastStatus = response.status;
          continue; // Try next key
        }
        
        // For non-key-related server errors (5xx), fail fast as it's likely a Google-side issue.
        console.error(`Non-retriable server error with key ...${key.slice(-4)}: ${response.status}`);
        return response;

      } catch (error) {
        console.error(`Fetch error with key ...${key.slice(-4)}:`, error);
        lastErrorBody = (error instanceof Error) ? error.message : String(error);
        lastStatus = 500; // Network errors are internal server errors
        // Continue to the next key if a network error occurs
      }
    }

    // If all keys have failed, return the last recorded error.
    console.error("All API keys failed. Returning last known error.");
    return new Response(lastErrorBody, { status: lastStatus });

  } catch (error) {
    console.error('An unexpected error occurred in the proxy handler:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}