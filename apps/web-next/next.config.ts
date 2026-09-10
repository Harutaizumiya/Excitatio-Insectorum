import type { NextConfig } from 'next';
import path from 'node:path';
import { codeInspectorPlugin } from 'code-inspector-plugin';

const isStaticExport = process.env.NEXT_OUTPUT_MODE === 'export';

const nextConfig: NextConfig = {
  output: isStaticExport ? 'export' : 'standalone',
  ...(isStaticExport
    ? {
        images: {
          unoptimized: true,
        },
        trailingSlash: true,
      }
    : {
        outputFileTracingRoot: path.join(__dirname, '../..'),
        async redirects() {
          return [
            {
              source: '/invite/:token',
              destination: '/invite?token=:token',
              permanent: false,
            },
          ];
        },
      }),
  turbopack: {
    rules: codeInspectorPlugin({
      bundler: 'turbopack',
    }),
  },
  webpack: (config) => {
    config.plugins.push(codeInspectorPlugin({ bundler: 'webpack' }));
    return config;
  },
};

export default nextConfig;
