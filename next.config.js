/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack dev (default in Next 16) can 404 nested App Router API routes (e.g. /api/auth/login).
  // Use `npm run dev` which passes --webpack until that is fixed upstream.
  turbopack: {},

  // Enable React strict mode for better performance and catching potential issues
  reactStrictMode: true,

  // Allow dev requests from other machines/origins on the LAN
  allowedDevOrigins: ['192.168.1.32'],
  
  // Memory optimization settings
  experimental: {
    // Reduce memory usage by optimizing bundle size
    optimizeCss: {
      critters: {
        ssrMode: 'critical'
      }
    },
    // Optimize server-side rendering
    serverActions: {
      bodySizeLimit: '2mb'
    },
    // Optimize client-side navigation
    clientRouterFilter: true,
    clientRouterFilterRedirects: true,
    // Optimize bundle loading
    optimizePackageImports: ['antd', '@ant-design/icons'],
  },

  // Treat these packages as external in the server build
  serverExternalPackages: ['mysql2'],
  
  // Compiler optimization
  compiler: {
    // Remove console logs in production to reduce bundle size
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Image optimization
  images: {
    // Limit image optimization memory usage
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
    minimumCacheTTL: 60,
    // Optimize image loading
    unoptimized: false,
  },
  
  // Performance and caching optimizations
  poweredByHeader: false,
  compress: true,
  
  // Bundle and code splitting
  webpack: (config, { dev, isServer }) => {
    // Memory optimization for webpack
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              // Increase cache size for better performance
              maxSize: 250000,
            },
            // Additional cache groups for better code splitting
            commons: {
              test: /[\\/]src[\\/]/,
              name: 'commons',
              chunks: 'all',
              minChunks: 2,
            },
            // Separate Ant Design components for better caching
            antd: {
              test: /[\\/]node_modules[\\/]antd[\\/]/,
              name: 'antd',
              chunks: 'all',
              priority: 20,
            },
            // Separate icons for better caching
            icons: {
              test: /[\\/]node_modules[\\/]@ant-design[\\/]icons[\\/]/,
              name: 'icons',
              chunks: 'all',
              priority: 15,
            },
          },
        },
        // Enable more aggressive code minification
        minimizer: config.optimization.minimizer,
        // Better tree shaking
        usedExports: true,
        sideEffects: false,
      };
    }
    
    // Optimize for production builds
    if (!dev && !isServer) {
      config.optimization.minimize = true;
      config.optimization.minimizer = config.optimization.minimizer || [];
    }
    
    return config;
  },
  
  // Reduce memory usage in development
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
  
  // Static export configuration - disabled for API routes with database
  // output: process.env.NODE_ENV === 'production' ? 'export' : undefined,

  // Standalone output: creates a minimal self-contained build for deployment on another server
  output: 'standalone',

  // Tracing and performance monitoring
  productionBrowserSourceMaps: true,
  
  // Optimize headers for better caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        // Never mark dynamic /api as publicly cacheable — breaks auth and permission APIs (sidebar,
        // role checks) if a proxy or browser reuses a stale 401/200 for another user or session.
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig; 