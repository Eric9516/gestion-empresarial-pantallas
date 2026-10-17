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
      // Le avisa al navegador, desde el primer instante, con qué servidor de datos va a hablar: abre la conexión (DNS + TLS) mientras todavía descarga la app,
      // en vez de recién cuando hace el primer pedido. Cada cliente tiene su propio servidor, por eso se arma al compilar con la dirección de ese cliente.
      {
        name: 'preconectar-servidor-de-datos',
        transformIndexHtml() {
          try {
            const origen = new URL(env.VITE_SUPABASE_URL).origin
            return [{ tag: 'link', attrs: { rel: 'preconnect', href: origen, crossorigin: '' }, injectTo: 'head-prepend' as const }]
          } catch {
            return []
          }
        },
      },
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
      exclude: ['**/node_modules/**', '**/dist/**', 'panel/**', 'e2e/**'],
      environment: 'node', // alcanza para probar funciones sueltas; si más adelante testeamos componentes con DOM, esto pasaría a 'jsdom'.
    },
  }
})
