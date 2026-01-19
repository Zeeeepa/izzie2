import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable cache components (includes Partial Prerendering)
  cacheComponents: true,
  typescript: {
    // Enable strict type checking during build
    tsconfigPath: './tsconfig.json',
  },
  // Enable instrumentation hook for server startup tasks
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
