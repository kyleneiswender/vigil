import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward /nvd-api/* to services.nvd.nist.gov server-side, bypassing CORS.
      '/nvd-api': {
        target:       'https://services.nvd.nist.gov',
        changeOrigin: true,
        rewrite:      (path) => path.replace(/^\/nvd-api/, ''),
        configure:    (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Cloudflare (in front of NVD) blocks requests that look like browser
            // traffic from a localhost origin. Strip the headers that trigger it.
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('cookie');
          });
        },
      },
      // Forward /kev-api/* to www.cisa.gov server-side, bypassing CORS.
      // CISA returns 200 OK but omits Access-Control-Allow-Origin headers.
      '/kev-api': {
        target:       'https://www.cisa.gov',
        changeOrigin: true,
        rewrite:      (path) => path.replace(/^\/kev-api/, ''),
        configure:    (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('cookie');
          });
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
})
