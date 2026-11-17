// "pnpm run dev": arranca la app en esta computadora, con la base de ejemplo (base.mjs), y abre el navegador.
// La app es la misma que usa la empresa (Next.js, carpeta web/), en modo desarrollo: cada cambio en un archivo se ve al instante.
// Nada de esto se conecta a un servidor real ni a datos reales.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBase, CARPETA, CLAVE, ROL_DE_NEXT, USUARIOS } from './base.mjs';
import { atenderPorTcp } from './puente.mjs';

const RAIZ = join(import.meta.dirname, '..');
const PUERTO_BASE = 54399;
const PUERTO_APP = 3020;
const DIRECCION = `http://localhost:${PUERTO_APP}`;

const db = await abrirBase();
await atenderPorTcp(db, { puerto: PUERTO_BASE, rol: ROL_DE_NEXT });
const archivos = join(CARPETA, 'archivos');
mkdirSync(archivos, { recursive: true });

console.log(`\n  La app arranca en ${DIRECCION}  (para cortarla: Ctrl + C)\n`);
console.log(`  Usuarios de ejemplo (todos con la contraseña ${CLAVE}):`);
for (const [email, quien] of USUARIOS) console.log(`    ${email.padEnd(26)} ${quien}`);
console.log('');

const next = spawn('npx', ['next', 'dev', '--port', String(PUERTO_APP)], {
  cwd: join(RAIZ, 'web'),
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: `postgres://${ROL_DE_NEXT}@127.0.0.1:${PUERTO_BASE}/postgres`,
    // la base de ejemplo atiende de a una conexión
    CONEXIONES_DE_LA_BASE: '1',
    ARCHIVOS_DIR: archivos,
    // sin avisos al celular (necesitan el servidor real)
    SIN_AVISOS: '1',
    NEXT_TELEMETRY_DISABLED: '1',
  },
});

// abre el navegador cuando la app ya responde (no dentro de Claude ni en pruebas automáticas)
if (!process.env.CI && !process.env.CLAUDECODE && !process.env.SIN_NAVEGADOR) {
  (async () => {
    for (let i = 0; i < 120; i++) {
      try { await fetch(`${DIRECCION}/entrar`); break; } catch { await new Promise(r => setTimeout(r, 1000)); }
    }
    const abrir = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', DIRECCION]] : process.platform === 'darwin' ? ['open', [DIRECCION]] : ['xdg-open', [DIRECCION]];
    spawn(abrir[0], abrir[1], { stdio: 'ignore', detached: true }).unref();
  })();
}

const cerrar = async () => { try { next.kill(); } catch { /* ya estaba cerrada */ } try { await db.close(); } catch { /* ya estaba cerrada */ } process.exit(0); };
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
next.on('exit', code => { console.error(code ? `\nLa app se cerró con un error (código ${code}).` : '\nLa app se cerró.'); void cerrar(); });
