# Gemini Balance Lite (Next.js Edition)

[简体中文](README.md)
---

## Project Overview

This project is a proxy service for the Google Gemini API, built with Next.js and optimized for the Vercel platform. It helps you to:
- **Proxy API Requests**: Provides a stable relay service in network environments where direct access to Google APIs is restricted.
- **Achieve Load Balancing**: By aggregating multiple Gemini API Keys and randomly selecting one for each request, it effectively distributes the request load, allowing you to overcome free-tier rate limits.
- **OpenAI API Compatibility**: Intelligently recognizes and converts requests from the OpenAI API format, allowing you to seamlessly connect with the vast ecosystem of third-party tools like LobeChat, One API, and more.

## Deploy on Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftech-shrimp%2Fgemini-balance-lite&project-name=gemini-balance-lite-nextjs&repository-name=gemini-balance-lite-nextjs)

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
After deploying and configuring your custom domain, your proxy endpoint will be `https://<your-custom-domain>/api`.

The project's homepage will automatically generate the currently available proxy URL and provide a copy button for your convenience.

#### 2. Get Your Gemini API Key(s)
Go to [Google AI Studio](https://aistudio.google.com) to obtain one or more free Gemini API Keys.

#### 3. Configure Your Client
Enter your proxy endpoint and API key(s) into any AI client that supports either the Gemini or OpenAI format.

-   **API Endpoint / Base URL**: `https://<your-custom-domain>/api`
-   **API Key**: Your **Gemini API Key**.
    -   For native Gemini clients, enter your key(s) in the appropriate field. Multiple keys can be separated by a comma `,`.
    -   For OpenAI-format clients, enter a **single** Gemini API Key in the `API Key` field (often as a `Bearer` token, which most clients handle automatically).

## Local Development

1.  **Clone the repository**
    ```bash
    git clone https://github.com/LiquorXR/gemini-balance-lite-nextjs.git
    cd gemini-balance-lite-nextjs
    ```
2.  **Install dependencies**
    ```bash
    npm install
    ```
3.  **Run the development server**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:3000`.
