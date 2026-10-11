/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Los mapas de código solo se generan si hay token de Sentry para subirlos y
  // borrarlos después. Sin token no se generan: así nunca quedan publicados.
  const subirMapas = Boolean(env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT)

  return {
    plugins: [
      react(),
      tailwindcss(),
      subirMapas && sentryVitePlugin({
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        authToken: env.SENTRY_AUTH_TOKEN,
        telemetry: false,
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        errorHandler: err => { console.warn('[sentry] No se pudieron subir los mapas de código:', err.message) },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      sourcemap: subirMapas ? 'hidden' : false,
    },
    test: {
      // El panel de administración (carpeta panel/) tiene sus propias pruebas y dependencias: no se mezclan con las de la app.
      exclude: ['**/node_modules/**', '**/dist/**', 'panel/**'],
      environment: 'node', // alcanza para probar funciones sueltas; si más adelante testeamos componentes con DOM, esto pasaría a 'jsdom'.
    },
  }
})
