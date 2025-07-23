# Gemini Balance Lite (Next.js 版)

[English Version](README.en-US.md)
---

## 项目简介

本项目是一个为 Google Gemini API 设计的代理服务，基于 Next.js 构建，并已为 Vercel 平台优化。它可以帮助您：
- **中转 API 请求**: 在无法直连 Google API 的网络环境中，提供稳定的中转服务。
- **实现负载均衡**: 通过聚合多个 Gemini API Key，并在每次请求时随机选用一个，从而有效分摊请求压力，突破免费额度限制。
- **兼容 OpenAI 格式**: 智能识别并转换 OpenAI API 格式的请求，让您可以无缝对接 LobeChat、One API 等广受欢迎的第三方工具生态。

## Vercel 部署 (推荐)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftech-shrimp%2Fgemini-balance-lite&project-name=gemini-balance-lite-nextjs&repository-name=gemini-balance-lite-nextjs)

<br>点击上方按钮，使用您的 GitHub 账户登录，即可一键部署。

## 配置自定义域名 (重要)

**为了确保在中国大陆地区的稳定访问，强烈建议配置您自己的域名。** Vercel 分配的 `.vercel.app` 域名可能会遇到访问性问题。

配置步骤如下：
1.  在 Vercel 的项目仪表盘中，进入 **Settings** -> **Domains**。
2.  输入你自己的域名并添加。
3.  根据 Vercel 提供的指引（通常是添加一个 `A` 记录或 `CNAME` 记录），在你的域名注册商（如 GoDaddy, Cloudflare 等）后台完成 DNS 配置。
4.  等待 DNS 生效后，Vercel 会自动完成验证和 SSL 证书配置。

## 如何使用

#### 1. 获取代理域名
部署并配置好自定义域名后，你的代理地址就是 `https://<你的自定义域名>`。

项目首页会自动生成当前可用的代理地址，并提供一键复制功能。

#### 2. 获取 Gemini API Key
前往 [Google AI Studio](https://aistudio.google.com) 申请一个或多个免费的 Gemini API Key。

#### 3. 配置客户端
将您的代理地址和 API Key 填入任意支持 Gemini 或 OpenAI 格式的 AI 客户端即可。

-   **API 端点 / Base URL**: `https://<你的自定义域名>`
-   **API 密钥**: 填入您的 **Gemini API Key**。
    -   对于原生 Gemini 客户端，请将密钥填入对应的字段，多个密钥可用英文逗号 `,` 分隔。
    -   对于 OpenAI 格式的客户端，请在 `API Key` 字段中填入**单个** Gemini API Key (通常以 `Bearer ` 前缀的形式，但大部分客户端会自动处理)。


## 本地调试

1.  **克隆仓库**
    ```bash
    git clone https://github.com/LiquorXR/gemini-balance-lite-nextjs.git
    cd gemini-balance-lite-nextjs
    ```
2.  **安装依赖**
    ```bash
    npm install
    ```
3.  **启动开发服务器**
    ```bash
    npm run dev
    ```
    应用将在 `http://localhost:3000` 上运行。
