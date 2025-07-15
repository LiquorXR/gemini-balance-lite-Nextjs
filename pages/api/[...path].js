// This route will proxy requests to the Google Gemini API.
// It supports load balancing and intelligent retries across multiple API keys.

export const config = {
  runtime: 'edge', // Use the Edge Runtime for best performance
};

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