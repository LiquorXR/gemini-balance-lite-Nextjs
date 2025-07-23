// A smart proxy for Google Gemini API.
// Features:
// - OpenAI API compatibility (chat completions and model listing).
// - Load balancing and retries for native Gemini API requests using `x-goog-api-key`.

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    let pathname = url.pathname;
    if (pathname.startsWith('/api')) {
      pathname = pathname.substring(4);
    }
    const searchParams = new URLSearchParams(url.search);
    searchParams.delete('path'); // Clean up potential redundant path parameter
    const search = searchParams.toString() ? `?${searchParams.toString()}` : '';

    console.log(`Incoming request: ${url.pathname}${url.search}`);

    let isOpenAIRequest = false;
    let isModelsRequest = false;

    // Detect OpenAI "list models" request
    if (request.method === 'GET' && /^\/(v1|v1beta)\/models$/.test(pathname)) {
      isOpenAIRequest = true;
      isModelsRequest = true;
      pathname = '/v1beta/openai/models';
      console.log(`OpenAI "list models" request detected. Path rewritten to: ${pathname}`);
    } 
    // Detect OpenAI "chat completions" request
    else if (request.method === 'POST') {
      // Must clone the request to read the body for detection
      const clonedRequest = request.clone();
      try {
        const body = await clonedRequest.json();
        if (body && Array.isArray(body.messages)) {
          isOpenAIRequest = true;
          pathname = '/v1beta/openai/chat/completions';
          console.log(`OpenAI "chat completions" request detected. Path rewritten to: ${pathname}`);
        }
      } catch (e) {
        console.warn("Could not parse JSON from body, assuming native Gemini request.");
      }
    }

    const targetDomain = 'https://generativelanguage.googleapis.com';
    const targetUrl = `${targetDomain}${pathname}${search}`;
    
    console.log(`Target URL: ${targetUrl}`);
    console.log(`Request Type: ${isOpenAIRequest ? 'OpenAI-Compatible' : 'Native-Gemini'}`);

    const headers = new Headers();
    if (request.headers.has('content-type')) {
      headers.set('content-type', request.headers.get('content-type'));
    }

    // Handle OpenAI-compatible requests (usually with a single Bearer token)
    const authHeader = request.headers.get('authorization');
    if (isOpenAIRequest && authHeader) {
      console.log("Forwarding OpenAI request with Authorization header.");
      headers.set('authorization', authHeader);
      
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
        duplex: 'half',
      });

      // For "list models" requests, we need to modify the response to be fully OpenAI-compliant.
      if (isModelsRequest && response.ok) {
        try {
          const originalJson = await response.json();
          if (originalJson.data && Array.isArray(originalJson.data)) {
            originalJson.data.forEach(model => {
              if (typeof model.id === 'string' && model.id.startsWith('models/')) {
                model.id = model.id.substring(7); // "models/gemini-pro" -> "gemini-pro"
              }
            });
          }
          const newHeaders = new Headers(response.headers);
          newHeaders.set('content-length', JSON.stringify(originalJson).length.toString());
          
          console.log("Successfully modified 'list models' response to remove 'models/' prefix.");
          return new Response(JSON.stringify(originalJson), {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        } catch (e) {
          console.error("Failed to modify 'list models' response:", e);
          return response; // Return original response on failure
        }
      }
      
      return response; // For other OpenAI requests (e.g., chat), stream the response directly.
    }

    // Handle native Gemini requests with load balancing and retries
    const apiKeyHeader = request.headers.get('x-goog-api-key');
    if (!apiKeyHeader) {
      return new Response(JSON.stringify({ error: "Header 'x-goog-api-key' is required for native Gemini requests." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const apiKeys = [...new Set(apiKeyHeader.split(',').map(k => k.trim()).filter(k => k))];
    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: "No valid API keys provided in 'x-goog-api-key' header." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Shuffle keys for load balancing
    for (let i = apiKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [apiKeys[i], apiKeys[j]] = [apiKeys[j], apiKeys[i]];
    }

    let lastErrorBody = null;
    let lastStatus = 500;

    for (const key of apiKeys) {
      headers.set('x-goog-api-key', key);
      console.log(`Trying native Gemini key: ...${key.slice(-4)}`);

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: headers,
          body: request.body,
          duplex: 'half',
        });

        if (response.ok) {
          console.log(`Key ...${key.slice(-4)} succeeded.`);
          return response;
        }

        // If a key-related error (4xx) occurs, try the next key.
        if (response.status >= 400 && response.status < 500) {
          console.warn(`Key ...${key.slice(-4)} failed with status ${response.status}. Trying next key.`);
          lastErrorBody = await response.text();
          lastStatus = response.status;
          continue;
        }
        
        // For server errors (5xx), fail fast as it's likely a Google-side issue.
        console.error(`Non-retriable server error with key ...${key.slice(-4)}: ${response.status}`);
        return response;

      } catch (error) {
        console.error(`Fetch error with key ...${key.slice(-4)}:`, error);
        lastErrorBody = (error instanceof Error) ? error.message : String(error);
        lastStatus = 500;
      }
    }

    console.error("All API keys failed. Returning the last recorded error.");
    return new Response(lastErrorBody, { status: lastStatus });

  } catch (error) {
    console.error('An unexpected error occurred in the proxy handler:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}