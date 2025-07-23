import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function HomePage() {
  const [apiUrl, setApiUrl] = useState('');
  const [copyText, setCopyText] = useState('Copy');
  const [apiKeys, setApiKeys] = useState('');
  const [availableKeys, setAvailableKeys] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState({});
  const [progress, setProgress] = useState(0);
  const [checkKeysButtonText, setCheckKeysButtonText] = useState('Check Keys');
  const [copyAllButtonText, setCopyAllButtonText] = useState('Copy All Available Keys');
  const [copiedStatus, setCopiedStatus] = useState({});

  useEffect(() => {
    const currentOrigin = window.location.origin;
    setApiUrl(currentOrigin);
  }, []);

  const handleCopy = (textToCopy) => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyText('Copied!');
      setTimeout(() => setCopyText('Copy'), 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
      setCopyText('Failed!');
      setTimeout(() => setCopyText('Copy'), 2000);
    });
  };

  const checkApiConnectivity = async () => {
    const initialKeys = apiKeys.replace(/,/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    const keys = [...new Set(initialKeys)];
    if (keys.length === 0) {
      setCheckKeysButtonText('Please enter at least one API key');
      setTimeout(() => setCheckKeysButtonText('Check Keys'), 2000);
      return;
    }

    setIsTesting(true);
    setAvailableKeys([]);
    setTestStatus(Object.fromEntries(keys.map(key => [key, 'Testing...'])));
    setProgress(0);

    const checkUrl = `${apiUrl}/v1beta/models/gemini-pro:generateContent`;
    const totalKeys = keys.length;
    let completedCount = 0;

    const promises = keys.map(async (key) => {
      try {
        const response = await fetch(checkUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify({ contents: [{ parts: [{ text: "hello" }] }] }),
        });

        if (response.ok) {
          setTestStatus(prev => ({ ...prev, [key]: 'Checked' }));
          return { key, available: true };
        } else {
          setTestStatus(prev => ({ ...prev, [key]: 'Checked' }));
          return { key, available: false };
        }
      } catch (error) {
        console.error(`Error testing key ...${key.slice(-4)}:`, error);
        setTestStatus(prev => ({ ...prev, [key]: 'Checked' }));
        return { key, available: false };
      } finally {
        completedCount++;
        setProgress(Math.round((completedCount / totalKeys) * 100));
      }
    });

    const results = await Promise.all(promises);
    setAvailableKeys(results.filter(r => r.available).map(r => r.key));
    setIsTesting(false);
  };
  
  const copyAllAvailable = () => {
    const text = availableKeys.join(',');
    handleCopy(text, 'all');
    setCopyAllButtonText(`Copied ${availableKeys.length} keys!`);
    setTimeout(() => setCopyAllButtonText('Copy All Available Keys'), 2000);
  };

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedStatus({ [key]: 'Copied!' });
      setTimeout(() => {
        setCopiedStatus(prev => ({ ...prev, [key]: undefined }));
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy key: ', err);
      setCopiedStatus({ [key]: 'Failed!' });
      setTimeout(() => {
        setCopiedStatus(prev => ({ ...prev, [key]: undefined }));
      }, 2000);
    });
  };
 
   return (
    <>
      <Head>
        <title>Universal Gemini API Proxy</title>
      </Head>
      <style jsx global>{`
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          background-color: #f3f4f6;
          color: #1f2937;
          padding: 2rem;
        }
        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          margin: 0 auto;
          max-width: 800px;
        }
        .card {
          background-color: white;
          padding: 2.5rem;
          border-radius: 0.75rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          text-align: center;
          width: 100%;
        }
        h1 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        p {
          color: #6b7280;
          margin-bottom: 1.5rem;
        }
        .url-container {
          display: flex;
          align-items: center;
          background-color: #f9fafb;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          font-family: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace;
          font-size: 1rem;
          word-break: break-all;
          margin-bottom: 1rem;
        }
        .url-text {
          flex-grow: 1;
          text-align: left;
        }
        button {
          padding: 0.6rem 1.2rem;
          border: none;
          background-color: #3b82f6;
          color: white;
          border-radius: 0.375rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
          white-space: nowrap;
        }
        button:hover {
          background-color: #2563eb;
        }
        button:active {
           background-color: #1d4ed8;
        }
        button:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }
        textarea {
          width: 100%;
          height: 150px;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-family: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace;
          font-size: 1rem;
          margin-bottom: 1rem;
          resize: vertical;
        }
        .progress-bar-container {
          width: 100%;
          background-color: #e5e7eb;
          border-radius: 0.375rem;
          height: 1rem;
          margin-bottom: 0.5rem;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background-color: #3b82f6;
          border-radius: 0.375rem;
          transition: width 0.2s ease-in-out;
        }
        .results-area {
          width: 100%;
          margin-top: 1.5rem;
          text-align: left;
        }
        .results-area h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }
        .status-list {
          list-style-type: none;
          padding: 0;
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid #e5e7eb;
          border-radius: 0.375rem;
          padding: 0.5rem;
        }
        .status-list li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid #e5e7eb;
          word-break: break-all;
        }
        .status-list li:last-child {
          border-bottom: none;
        }
        .status-list li.clickable-key {
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .status-list li.clickable-key:hover {
          background-color: #f9fafb;
        }
        .copy-status {
          color: #16a34a;
          font-weight: 500;
        }
        .button-group {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-top: 1rem;
        }
       .copy-all-button {
         background-color: #22c55e;
       }
       .copy-all-button:hover {
         background-color: #16a34a;
       }
       .copy-all-button:active {
         background-color: #15803d;
       }
       .endpoint-title {
          font-weight: 500;
          font-size: 0.9rem;
          color: #4b5563;
          margin-bottom: 0.5rem;
          text-align: left;
       }
      `}</style>
      <div className="container">
        <div className="card">
          <h1>Universal Gemini API Proxy</h1>
          <p>A single, smart endpoint for both OpenAI and native Gemini clients. Features load balancing and automatic retries.</p>
          
          <div className="url-container">
            <span className="url-text">{apiUrl || 'Loading...'}</span>
            <button onClick={() => handleCopy(apiUrl)} disabled={!apiUrl}>
              {copyText}
            </button>
          </div>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '-1rem' }}>
            Use this URL as the `baseURL` in your OpenAI client or as the endpoint for your native Gemini client.
          </p>
        </div>

        <div className="card">
          <h1>Gemini API Key Checker</h1>
          <p>Enter your Gemini API keys (one per line or comma-separated). The proxy will intelligently load-balance across all valid keys provided.</p>
          <textarea
            placeholder="AIzaSy...&#10;AIzaSy..."
            value={apiKeys}
            onChange={(e) => setApiKeys(e.target.value)}
          />
          <button onClick={checkApiConnectivity} disabled={isTesting || checkKeysButtonText !== 'Check Keys'}>
            {isTesting ? 'Testing...' : checkKeysButtonText}
          </button>

          {isTesting && (
            <div className="results-area">
              <h2>Test Progress...</h2>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p style={{ textAlign: 'center', marginBottom: '1rem' }}>{progress}% Complete</p>
            </div>
          )}

          {availableKeys.length > 0 && !isTesting && (
            <div className="results-area">
              <h2>Available Keys ({availableKeys.length})</h2>
              <ul className="status-list">
                {availableKeys.map(key => (
                  <li key={key} className="clickable-key" onClick={() => handleCopyKey(key)}>
                    <span>{key}</span>
                    {copiedStatus[key] && <span className="copy-status">{copiedStatus[key]}</span>}
                  </li>
                ))}
              </ul>
              <div className="button-group">
                <button onClick={copyAllAvailable} className="copy-all-button">{copyAllButtonText}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}