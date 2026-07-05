/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  transpilePackages: ['@coldcash/shared'],
  images: {
    unoptimized: true, // Required for static export
  },
};

module.exports = nextConfig;
