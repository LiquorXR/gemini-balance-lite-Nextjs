# Gemini Balance Lite

[简体中文](README.md)
---

## Project Overview

This project is a proxy service for the Google Gemini API, optimized for the Vercel platform. It helps you to:
- **Proxy API Requests**: Provides a stable relay service in network environments where direct access to Google APIs is restricted.
- **Achieve Load Balancing**: By aggregating multiple Gemini API Keys and randomly selecting one for each request, it effectively distributes the request load, allowing you to overcome free-tier rate limits.

## Deploy on Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FLiquorXR%2Fgemini-balance-lite)

<br>Click the button above and log in with your GitHub account for one-click deployment.

## Configure a Custom Domain (Important)

**To ensure stable access, especially in regions like mainland China, it is highly recommended to configure your own custom domain.** The `.vercel.app` domain assigned by Vercel may experience accessibility issues.

Follow these steps:
1.  In your Vercel project dashboard, go to **Settings** -> **Domains**.
2.  Enter your custom domain and add it.
3.  Follow the instructions provided by Vercel (usually adding an `A` record or a `CNAME` record) in your domain registrar's (e.g., GoDaddy, Cloudflare) DNS settings.
4.  Wait for the DNS changes to propagate. Vercel will automatically handle verification and SSL certificate configuration.

## How to Use

#### 1. Get Your Proxy Domain
After deploying and configuring your custom domain, your proxy endpoint will be `https://<your-custom-domain>`.

#### 2. Get Your Gemini API Key(s)
Go to [Google AI Studio](https://aistudio.google.com) to obtain one or more free Gemini API Keys.

#### 3. Configure Your Client
Enter your proxy endpoint and API key(s) into any Gemini-compatible AI client.

-   **API Endpoint**: `https://<your-custom-domain>`
-   **API Key**: Your Gemini API Key. If you have multiple keys, separate them with a comma `,`.

## Local Development

1.  **Clone the repository**
    ```bash
    git clone https://github.com/LiquorXR/gemini-balance-lite.git
    cd gemini-balance-lite
    ```
2.  **Install Python dependencies**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run the development server**
    You'll need `uvicorn` to run the FastAPI application.
    ```bash
    uvicorn api.index:app --reload
    ```
    The application will be available at `http://127.0.0.1:8000`.
