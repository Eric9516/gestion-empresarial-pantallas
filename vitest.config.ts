import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Las pruebas de funciones sueltas (las reglas y utilidades de src/ que usan las pantallas): pnpm test.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // el panel (carpeta panel/), la app de Next (web/) y las pruebas de pantalla (e2e/) tienen las suyas
    exclude: ['**/node_modules/**', '**/dist/**', 'panel/**', 'web/**', 'e2e/**'],
    environment: 'node',
  },
});
