/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '1mb' } },
  serverExternalPackages: ['square'],
};

export default nextConfig;
