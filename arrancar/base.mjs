// La base de datos de esta copia: una PostgreSQL de verdad que corre adentro de Node (PGlite), sin instalar nada ni conectarse a ningún
// servidor. Se arma con los mismos archivos que la base de la app real (supabase/componentes y web/db) y se llena con datos INVENTADOS.
// Se guarda en la carpeta datos-de-prueba/ (no se sube a GitHub): lo que cargues queda para la próxima vez. Si llega una versión nueva de la
// app con cambios en la base, se vuelve a armar desde cero (y se avisa). Para empezar de nuevo a mano: pnpm run datos-nuevos.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const RAIZ = join(import.meta.dirname, '..');
export const CARPETA = join(RAIZ, 'datos-de-prueba');
const BASE = join(CARPETA, 'base');
const HUELLA = join(CARPETA, 'version-de-la-base.txt');
// la misma librería con la que la app compara la contraseña al entrar
const bcrypt = createRequire(join(RAIZ, 'web', 'package.json'))('bcryptjs');
export const ROL_DE_NEXT = 'app_local';
export const CLAVE = 'Ejemplo-2026';
export const USUARIOS = [
  ['dueno@ejemplo.test', 'Dueño (puede todo)'],
  ['responsable@ejemplo.test', 'Responsable de Mantenimiento'],
  ['jefe@ejemplo.test', 'Jefe de taller'],
  ['tecnico@ejemplo.test', 'Técnico'],
  ['tecnico2@ejemplo.test', 'Otro técnico'],
  ['consulta@ejemplo.test', 'Solo consulta (Producción)'],
  ['deposito@ejemplo.test', 'Encargado del Depósito'],
];

/** Los archivos de la base, en el orden en que se aplican (el mismo que web/db/esquema.sh). */
function archivosDeLaBase() {
  const lista = [join(RAIZ, 'web/db/01-piezas-de-supabase.sql')];
  for (const c of ['base', 'abastecimiento', 'mantenimiento']) {
    const dir = join(RAIZ, 'supabase/componentes', c);
    for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) lista.push(join(dir, f));
  }
  for (const f of ['02-sesiones.sql', '03-usuarios.sql', '04-plataforma.sql', '05-avisos.sql']) lista.push(join(RAIZ, 'web/db', f));
  return lista;
}

const nuevaBase = dir => new PGlite(dir, { extensions: { pg_trgm, pgcrypto, uuid_ossp } });

export async function abrirBase() {
  const archivos = archivosDeLaBase();
  const huella = createHash('sha256').update(archivos.map(f => readFileSync(f)).join('\n')).digest('hex');
  const anterior = existsSync(HUELLA) ? readFileSync(HUELLA, 'utf8').trim() : null;
  if (anterior === huella && existsSync(BASE)) return nuevaBase(BASE);

  if (anterior) console.log('\n  La app trae cambios en la base de datos: se vuelve a armar con los datos de ejemplo (lo que habías cargado se borra).\n');
  else console.log('\n  Armando la base de datos con los datos de ejemplo (la primera vez tarda un poco)…\n');
  rmSync(BASE, { recursive: true, force: true });
  mkdirSync(CARPETA, { recursive: true });
  const db = nuevaBase(BASE);
  for (const f of archivos) await db.exec(readFileSync(f, 'utf8'));
  // el rol con el que se conecta la app (el mismo permiso que tiene en el servidor real)
  await db.exec(`
    create role ${ROL_DE_NEXT} login noinherit;
    grant authenticated to ${ROL_DE_NEXT} with inherit false, set true;
    grant anon to ${ROL_DE_NEXT} with inherit false, set true;
    grant usage on schema servidor to ${ROL_DE_NEXT};
    grant execute on all functions in schema servidor to ${ROL_DE_NEXT};
  `);
  await sembrar(db);
  writeFileSync(HUELLA, huella + '\n');
  return db;
}

// ---------------- Los datos de ejemplo (INVENTADOS: no son equipos, personas ni marcas reales) ----------------

async function sembrar(db) {
  const uno = async (sql, valores) => (await db.query(sql, valores)).rows[0];
  const TODOS = ['proveedores', 'comisionistas', 'envios', 'deposito', 'mantenimiento', 'tareas'];
  await db.query('update public.licencia set modulos = $1 where id = 1', [Object.fromEntries(TODOS.map(m => [m, true]))]);
  await db.query('update public.configuracion set empresa_nombre = $1, inicial_cerrada_at = now() where id = 1', ['Planta de ejemplo']);

  const crear = async (email, nombre, extra) => {
    const { id } = await uno(`insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
      values ($1, $2, now(), $3) returning id`, [email, bcrypt.hashSync(CLAVE, 10), { full_name: nombre }]);
    const [n, ...a] = nombre.split(' ');
    const perfil = { id, email, nombre: n, apellido: a.join(' ') || 'Ejemplo', rol: 'user', activo: true, ...extra };
    const cols = Object.keys(perfil);
    await db.query(`insert into public.usuarios_perfil (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
      on conflict (id) do update set ${cols.map(c => `${c} = excluded.${c}`).join(', ')}`, Object.values(perfil));
    return id;
  };
  const dueno = await crear('dueno@ejemplo.test', 'Dueño Ejemplo', { es_owner: true, rol: 'admin', mantenimiento_rol: 'admin' });
  await crear('responsable@ejemplo.test', 'Rita Responsable', { rol: 'disabled', rol_equipos: 'admin', puede_ver_calendario: true });
  await crear('jefe@ejemplo.test', 'Julio Jefe', { rol: 'disabled', rol_equipos: 'jefe', puede_ver_calendario: true });
  await crear('tecnico@ejemplo.test', 'Tomás Técnico', { rol: 'disabled', rol_equipos: 'tecnico' });
  await crear('tecnico2@ejemplo.test', 'Teresa Técnica', { rol: 'disabled', rol_equipos: 'tecnico' });
  await crear('consulta@ejemplo.test', 'Pablo Producción', { rol: 'disabled', rol_equipos: 'consulta' });
  await crear('deposito@ejemplo.test', 'Diego Depósito', { rol: 'user', mantenimiento_rol: 'admin' });
  await db.query('insert into plataforma.administradores (usuario_id) values ($1)', [dueno]);

  // ---- Depósito: unos repuestos (el stock inicial se siembra directo; en la app solo cambia con movimientos) ----
  const fam = (await uno(`insert into public.familias (codigo, nombre) values ('RE', 'Repuestos mecánicos') returning id`)).id;
  const sub = (await uno(`insert into public.subfamilias (familia_id, codigo, nombre) values ($1, 'RO', 'Rodamientos y sellos') returning id`, [fam])).id;
  await db.query(`insert into public.proveedores (nombre, rubro) values ('Proveedor de ejemplo', 'Repuestos')`);
  await db.query(`insert into public.sectores (nombre) values ('Planta de ejemplo')`);
  await db.exec(`select set_config('app.mover_stock', 'on', false)`);
  const REPUESTOS = [
    ['Rodamiento 6205 (EJEMPLO)', 12, 4], ['Sello mecánico 30 mm (EJEMPLO)', 3, 2], ['Filtro de aire de compresor (EJEMPLO)', 1, 2],
    ['Junta de placa (EJEMPLO)', 40, 20], ['Correa en V A-42 (EJEMPLO)', 6, 2], ['Aceite para compresor 5 l (EJEMPLO)', 4, 1],
  ];
  const items = [];
  for (const [i, [descripcion, stock, minimo]] of REPUESTOS.entries()) {
    items.push((await uno(`insert into public.items (codigo, numero, descripcion, familia_id, subfamilia_id, stock, stock_minimo, punto_pedido)
      values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`, [`MRERO${String(i + 1).padStart(5, '0')}`, String(i + 1), descripcion, fam, sub, stock, minimo, minimo + 1])).id);
  }
  await db.exec(`select set_config('app.mover_stock', 'off', false)`);

  // ---- Mantenimiento: sectores, sub-sectores y equipos (los de ejemplo del encargado, con sus sub-equipos) ----
  const sectores = new Map();
  const sector = async (nombre, padre = null, orden = null) => {
    const clave = padre ? `${padre}/${nombre}` : nombre;
    if (!sectores.has(clave)) {
      sectores.set(clave, (await uno('insert into public.equipo_sectores (nombre, padre_id, orden) values ($1, $2, $3) returning id',
        [nombre, padre ? sectores.get(padre) : null, orden])).id);
    }
    return sectores.get(clave);
  };
  for (const [i, s] of ['Proceso', 'Envasado', 'Servicios', 'Almacenamiento'].entries()) await sector(s, null, i + 1);
  for (const s of ['Agua', 'Aire comprimido', 'Vapor']) await sector(s, 'Servicios');

  const equipos = new Map();
  const equipo = async ({ codigo, nombre, sector: s, sub, padre, etiquetas = [], marca = '', modelo = '', serie = '', ubicacion = '', critico = false }) => {
    const id = (await uno(`insert into public.equipos (codigo, nombre, sector_id, padre_id, etiquetas, marca, modelo, numero_serie, ubicacion, critico, notas)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'EJEMPLO.') returning id`,
    [codigo, nombre, sub ? await sector(sub, s) : await sector(s), padre ? equipos.get(padre) : null, etiquetas, marca, modelo, serie, ubicacion, critico])).id;
    equipos.set(codigo, id);
    return id;
  };
  await equipo({ codigo: 'BC-01', nombre: 'Bomba centrífuga de agua', sector: 'Servicios', sub: 'Agua', etiquetas: ['bomba', 'agua', 'sala de bombas'], marca: 'Marca A', modelo: 'CX-200', serie: 'EJ-48213', ubicacion: 'Sala de bombas', critico: true });
  await equipo({ codigo: 'CP-01', nombre: 'Compresor de aire a tornillo', sector: 'Servicios', sub: 'Aire comprimido', etiquetas: ['compresor', 'aire comprimido'], marca: 'Marca B', modelo: 'T-75', serie: 'EJ-99120', ubicacion: 'Sala de compresores', critico: true });
  await equipo({ codigo: 'CA-01', nombre: 'Caldera de vapor', sector: 'Servicios', sub: 'Vapor', etiquetas: ['caldera', 'vapor', 'quemador'], marca: 'Marca H', modelo: 'CV-1000', serie: 'EJ-20077', ubicacion: 'Sala de calderas', critico: true });
  await equipo({ codigo: 'CT-02', nombre: 'Cinta transportadora de salida', sector: 'Envasado', etiquetas: ['cinta', 'línea 1', 'motorreductor'], marca: 'Marca C', modelo: 'CT-6m', serie: 'EJ-30551', ubicacion: 'Línea 1' });
  await equipo({ codigo: 'EN-01', nombre: 'Envasadora automática', sector: 'Envasado', etiquetas: ['envasadora', 'línea 1', 'neumática'], marca: 'Marca D', modelo: 'EV-1200', serie: 'EJ-77001', ubicacion: 'Línea 1', critico: true });
  await equipo({ codigo: 'CF-01', nombre: 'Equipo de frío de cámara', sector: 'Almacenamiento', etiquetas: ['frío', 'cámara', 'refrigeración'], marca: 'Marca E', modelo: 'RF-30', serie: 'EJ-11045', ubicacion: 'Cámara 1', critico: true });
  await equipo({ codigo: 'AE-01', nombre: 'Autoelevador eléctrico', sector: 'Almacenamiento', etiquetas: ['autoelevador', 'batería'], marca: 'Marca G', modelo: 'AE-2T', serie: 'EJ-50318', ubicacion: 'Depósito' });
  await equipo({ codigo: 'TQ-03', nombre: 'Tanque con agitador', sector: 'Proceso', etiquetas: ['tanque', 'agitador', 'motor'], marca: 'Marca F', modelo: 'AG-500', serie: 'EJ-62290', ubicacion: 'Sala de proceso' });
  // dos pasteurizadores iguales, con sus sub-equipos
  for (const n of ['1', '2']) {
    const c = `PA-0${n}`;
    const base = { sector: 'Proceso', marca: 'Marca J', ubicacion: 'Sala de proceso' };
    await equipo({ ...base, codigo: c, nombre: `Pasteurizador ${n}`, etiquetas: ['pasteurizador', 'línea de proceso'], modelo: 'PZ-10000', serie: `EJ-P${n}`, critico: true });
    await equipo({ ...base, codigo: `${c}-PL`, padre: c, nombre: 'Placa intercambiadora', etiquetas: ['placas', 'juntas'], modelo: 'IP-45', serie: `EJ-P${n}-PL`, critico: true });
    await equipo({ ...base, codigo: `${c}-B1`, padre: c, nombre: 'Bomba de alimentación', etiquetas: ['bomba'], modelo: 'BC-150', serie: `EJ-P${n}-B1` });
    await equipo({ ...base, codigo: `${c}-B2`, padre: c, nombre: 'Bomba de retorno', etiquetas: ['bomba'], modelo: 'BC-150', serie: `EJ-P${n}-B2` });
    await equipo({ ...base, codigo: `${c}-SE`, padre: c, nombre: 'Separadora', etiquetas: ['separadora', 'centrífuga'], modelo: 'SC-20', serie: `EJ-P${n}-SE`, critico: true });
  }
  // repuestos críticos de algunos equipos (salen del Depósito)
  const critico = (codigo, item, cantidad) => db.query('insert into public.equipo_items (equipo_id, item_id, cantidad) values ($1, $2, $3)', [equipos.get(codigo), item, cantidad]);
  await critico('BC-01', items[0], 2);
  await critico('BC-01', items[1], 1);
  await critico('CP-01', items[2], 1);
  await critico('CP-01', items[5], 1);
  await critico('PA-01-PL', items[3], 20);
  await critico('PA-02-PL', items[3], 20);
  await critico('CT-02', items[4], 2);

  // las OT terminadas les llegan al jefe y al responsable a toda hora
  await db.query(`insert into public.mantenimiento_config (horario_recepcion)
    select jsonb_agg(jsonb_build_object('dia', d, 'desde', '00:00', 'hasta', '23:59')) from generate_series(0, 6) d`);
}
