// vite.config.js - OPTIMIZED FOR PRODUCTION

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  build: {
    // ✅ Increase chunk size warning limit
    chunkSizeWarningLimit: 1600, // 1000 KB instead of default 500 KB
    
    // ✅ Split chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks (third-party libraries)
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          'ui-vendor': ['framer-motion', 'lucide-react'],
        },
      },
    },
    
    // ✅ Optimize output
    minify: 'esbuild',
    sourcemap: false, // Disable source maps in production
  },
  
  // ✅ Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})