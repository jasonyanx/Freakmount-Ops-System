/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is a native addon — keep it external to the server
  // bundle rather than letting webpack try to bundle its binary.
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

module.exports = nextConfig;
