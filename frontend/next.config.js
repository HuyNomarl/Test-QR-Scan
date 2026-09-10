/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable PWA service worker in production
  headers: async () => [
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      ],
    },
  ],
  // Allow face-api.js model files
  webpack(config) {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};
module.exports = nextConfig;
