/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        // Match paths like /v1/models, /v1beta/models, etc.
        // and proxy them to the /api handler.
        source: '/:version(v1|v1beta)/:path*',
        destination: '/api/:version/:path*',
      },
    ];
  },
};

module.exports = nextConfig;