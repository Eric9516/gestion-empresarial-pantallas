'use server';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { Configuracion, ConteosIniciales, DatosDeEmpresa, DisenoDeRotuloAGuardar, PlanillaDeFamilias } from '@/features/admin/servicioDeConfiguracion';
import type { ErrorLogRow } from '@/features/admin/tipos';
import type { FilaFotoPendiente } from '@/features/admin/tipos';
import type { ArgumentosDelHistorial, FilaActividad } from '@/features/admin/historialDeActividad';
import type { FilaPapelera } from '@/features/admin/tipos';
import type { Sugerencia } from '@/features/admin/tipos';
import type { Usuario, UsuarioInput } from '@/features/admin/tipos';
import type { CampoCustom } from '@/features/config/camposCustom';
import type { DatosDeposito, Deposito } from '@/features/depositos/tipos';
import type { Familia, Subfamilia } from '@/features/familias/tipos';
import type { DatosDeFamiliasParaImportar, LoteDeFamilias } from '@/features/familias/importarFamilias';
import type { DatosParaImportarStock, FilaAImportar } from '@/features/items/importarStock';
import { CAMPOS_POR_SLOT, SLOTS_FOTO, type FotoSlot } from '@/features/items/slotsDeFoto';
import { LARGO_MINIMO_CLAVE } from '@/features/perfil/permisos';
import type { RotuloDiseno } from '@/features/rotulos/tipos';
import type { Sector } from '@/features/sectores/tipos';
import { MODULOS, type ModuloId } from '@/lib/modulos';
import { nombreUsuario, type UsuarioBasico } from '@/lib/nombreUsuario';
import type { Cursor } from '@/lib/paginacion';
import { DEFAULT_DESIGN } from '@/lib/rotuloDesign';
import { contexto } from '~/lib/contexto';
import { contarAvisos, marcarVisto } from '~/lib/avisos';
import { borrarArchivo, guardarArchivo, rutaDeUrl, urlPublica } from '~/lib/archivos';
import { base, comoUsuario } from '~/lib/db';
import { exigirUsuario } from '~/lib/sesion';
import { Celda, CursorDePagina, Fecha, FechaONula, Id, IdNumerico, Json, Lista, Numero, SiNo, SiNoONulo, Texto, TextoONulo, entrada, Formulario } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';

// Configuración: lo que cada pestaña le pide al servidor. Cada acción vuelve a mirar quién tiene la sesión y la base aplica sus reglas (las
// mismas que con Supabase): desde el navegador no se puede pedir nada que esa persona no pueda hacer. Lo que cambia algo devuelve el error
// en vez de lanzarlo (Next no deja pasar al navegador el texto de un error).

type Resultado = { error: string | null; codigo?: string };
const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const texto = (v: unknown, largo: number) => String(v ?? '').trim().slice(0, largo);
const aviso = (mensaje: string) => Object.assign(new Error(mensaje), { code: 'P0001' });

async function leer<T>(hacer: (c: PoolClient) => Promise<T>): Promise<T> {
  const usuario = await exigirUsuario();
  return comoUsuario(usuario, hacer);
}

/** Hace el cambio como quien tiene la sesión; si sale bien, la cabecera y los menús se vuelven a dibujar (por si cambió el logo o un módulo). */
async function cambiar(hacer: (c: PoolClient, usuario: string) => Promise<unknown>, porDefecto: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  try {
    await comoUsuario(usuario, c => hacer(c, usuario));
  } catch (e) {
    return { error: mensajeDe(e, porDefecto), codigo: (e as { code?: string }).code };
  }
  revalidatePath('/', 'layout');
  return { error: null };
}

/** Que el cambio haya tocado algo (si la base no deja, no da error: no encuentra la fila). */
const algo = (r: { rowCount: number | null }, mensaje: string) => { if (!r.rowCount) throw aviso(mensaje); };

// Lo que reciben las acciones (lo revisa entrada(): ver ~/lib/entrada)
const Empresa = z.object({
  empresa_nombre: TextoONulo(300), empresa_direccion: TextoONulo(500), empresa_telefono: TextoONulo(100), empresa_email: TextoONulo(300),
  logo_base64: TextoONulo(1_500_000), empresa_razon_social: TextoONulo(300), empresa_cuit: TextoONulo(40), empresa_web: TextoONulo(300),
  color_primario: TextoONulo(20), color_deposito: TextoONulo(20), zona_horaria: TextoONulo(100),
});
const DisenoDeRotulo = z.object({ rotulo_design: Json(20_000), rotulo_pie: TextoONulo(2000), rotulo_campos: Json(2000) });
const ModeloDeRotulo = z.object({ nombre: TextoONulo(300), design: Json(20_000), pie: TextoONulo(2000), campos: Json(2000) });
const CamposDeComisionistas = Lista(z.object({ id: TextoONulo(100), label: TextoONulo(300), tipo: Texto(20) }), 100);
const LoteFamilias = z.object({
  familiasNuevas: Lista(z.object({ codigo: Celda, nombre: Celda }), 5000),
  familiasCompletar: Lista(z.object({ id: Id, codigo: Celda, nombre: Celda }), 5000),
  subfamiliasNuevas: Lista(z.object({ familiaCodigo: Celda, familiaNombre: Celda, codigo: Celda, nombre: Celda }), 20_000),
  subfamiliasCompletar: Lista(z.object({ id: Id, familiaId: Id, codigo: Celda, nombre: Celda }), 20_000),
});
const DepositoNuevo = z.object({ nombre: Texto(300), prefijo: Texto(10), color: TextoONulo(20), icono: TextoONulo(60), usa_retiros: SiNo, usa_reparaciones: SiNo });
const DepositoEditado = DepositoNuevo.extend({ id: Id, activo: SiNo, prefijo: TextoONulo(10) });
const DatosDeUsuario = z.object({
  nombre: TextoONulo(300), apellido: TextoONulo(300), email: TextoONulo(300), rol: TextoONulo(20), mantenimiento_rol: TextoONulo(20), rol_equipos: TextoONulo(20),
  puede_ver_retiros: SiNoONulo, puede_ver_errores: SiNoONulo, puede_resetear_contrasenas: SiNoONulo, puede_ver_sugerencias: SiNoONulo,
  puede_ajustar_inventario: SiNoONulo, puede_gestionar_depositos: SiNoONulo, puede_ver_auditoria: SiNoONulo, puede_ver_informe: SiNoONulo, puede_ver_calendario: SiNoONulo,
  depositos: Lista(z.object({ deposito_id: Id, rol: z.enum(['admin', 'comun']) }), 200).optional(),
});
const Contrasena = Texto(200);
const FiltrosDelHistorial = z.object({
  p_usuario: TextoONulo(60), p_deposito: TextoONulo(60), p_sobre: Lista(Texto(60), 20).nullish(), p_acciones: Lista(Texto(60), 100).nullish(),
  p_desde: FechaONula, p_hasta: FechaONula, p_texto: TextoONulo(500),
});
const DespuesDelHistorial = z.object({ momento: Fecha, id: z.union([Numero(0, Number.MAX_SAFE_INTEGER), Texto(30)]) }).nullish();
const TipoDePapelera = z.enum(['proveedor', 'repuesto', 'reparacion', 'envio']);
const Slot = z.enum(['foto_url', 'foto_url_2', 'foto_url_3']);
const FilasDeStock = Lista(z.object({
  codigo: Texto(100), descripcion: Texto(2000), familia_id: Id, subfamilia_id: Id, numero: Celda,
  stock: Numero(), stock_minimo: Numero(), punto_pedido: Numero(),
}), 50_000);

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Empresa, rótulo, comisionistas y módulos (la fila única de configuración)
// ---------------------------------------------------------------------------------------------------------------------------------------------

const MAXIMO_DE_LOGO = 1_500_000;

export async function guardarEmpresa(d: DatosDeEmpresa): Promise<Resultado> {
  await entrada('guardarEmpresa', [Empresa], [d]);
  const logo = d.logo_base64 ?? '';
  if (logo && (!/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(logo) || logo.length > MAXIMO_DE_LOGO)) return { error: 'El logo tiene que ser una imagen de menos de 1 MB' };
  const color = (v: string | null | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  return cambiar(async c => algo(await c.query(`
    update public.configuracion set empresa_nombre = $1, empresa_direccion = $2, empresa_telefono = $3, empresa_email = $4, logo_base64 = $5,
      empresa_razon_social = $6, empresa_cuit = $7, empresa_web = $8, color_primario = $9, zona_horaria = coalesce($10, zona_horaria) where id = 1`,
  [texto(d.empresa_nombre, 200), texto(d.empresa_direccion, 300), texto(d.empresa_telefono, 60), texto(d.empresa_email, 200), logo,
    texto(d.empresa_razon_social, 200), texto(d.empresa_cuit, 20), texto(d.empresa_web, 200), color(d.color_primario), d.zona_horaria ? texto(d.zona_horaria, 60) : null]),
  'No podés cambiar los datos de la empresa'), 'No se pudo guardar la configuración');
}

export async function guardarDisenoDelRotulo(d: DisenoDeRotuloAGuardar): Promise<Resultado> {
  await entrada('guardarDisenoDelRotulo', [DisenoDeRotulo], [d]);
  return cambiar(async c => algo(await c.query('update public.configuracion set rotulo_design = $1, rotulo_pie = $2, rotulo_campos = $3 where id = 1',
    [JSON.stringify(d.rotulo_design), texto(d.rotulo_pie, 500), JSON.stringify(d.rotulo_campos)]), 'No podés cambiar el diseño'), 'No se pudo guardar el diseño');
}

export async function restablecerDisenoDelRotulo(): Promise<Resultado> {
  await entrada('restablecerDisenoDelRotulo');
  return cambiar(async c => algo(await c.query('update public.configuracion set rotulo_design = $1 where id = 1', [JSON.stringify(DEFAULT_DESIGN)]),
    'No podés cambiar el diseño'), 'No se pudo restablecer');
}

export async function modelosDeRotulo(): Promise<RotuloDiseno[]> {
  await entrada('modelosDeRotulo');
  return leer(async c => (await c.query<{ r: RotuloDiseno }>('select to_jsonb(d) as r from public.rotulo_disenos d order by d.created_at desc')).rows.map(x => x.r));
}

export async function guardarModeloDeRotulo(m: { nombre: string; design: unknown; pie: string; campos: unknown }): Promise<Resultado> {
  await entrada('guardarModeloDeRotulo', [ModeloDeRotulo], [m]);
  if (!texto(m.nombre, 100)) return { error: 'Ponele un nombre al modelo' };
  return cambiar(c => c.query('insert into public.rotulo_disenos (nombre, design, pie, campos) values ($1, $2, $3, $4)',
    [texto(m.nombre, 100), JSON.stringify(m.design), texto(m.pie, 500), JSON.stringify(m.campos)]), 'No se pudo guardar el modelo');
}

/** El modelo pasa a ser el diseño de la empresa (se lee de la base, no del navegador). */
export async function usarModeloDeRotulo(id: number): Promise<Resultado> {
  await entrada('usarModeloDeRotulo', [IdNumerico], [id]);
  if (!Number.isInteger(id)) return { error: 'Modelo no válido' };
  return cambiar(async c => algo(await c.query(`
    update public.configuracion set rotulo_design = d.design, rotulo_pie = d.pie, rotulo_campos = d.campos, rotulo_diseno_id = d.id
    from public.rotulo_disenos d where configuracion.id = 1 and d.id = $1`, [id]), 'No se encontró el modelo'), 'No se pudo aplicar el modelo');
}

export async function eliminarModeloDeRotulo(id: number): Promise<Resultado> {
  await entrada('eliminarModeloDeRotulo', [IdNumerico], [id]);
  if (!Number.isInteger(id)) return { error: 'Modelo no válido' };
  return cambiar(async c => algo(await c.query('delete from public.rotulo_disenos where id = $1', [id]), 'No podés eliminar este modelo'),
    'No se pudo eliminar el modelo');
}

const TIPOS_DE_CAMPO = new Set(['text', 'tel', 'number', 'email', 'textarea']);

export async function guardarCamposDeComisionistas(campos: CampoCustom[]): Promise<Resultado> {
  await entrada('guardarCamposDeComisionistas', [CamposDeComisionistas], [campos]);
  const validos = (Array.isArray(campos) ? campos : []).slice(0, 50)
    .filter(k => texto(k?.label, 100) && TIPOS_DE_CAMPO.has(k.tipo))
    .map(k => ({ id: texto(k.id, 60) || `custom_${Date.now()}`, label: texto(k.label, 100), tipo: k.tipo }));
  return cambiar(async c => algo(await c.query('update public.configuracion set comisionistas_campos_custom = $1 where id = 1', [JSON.stringify(validos)]),
    'No podés cambiar los campos'), 'No se pudieron guardar los campos');
}

export async function definirModulo(id: ModuloId, apagado: boolean): Promise<Resultado> {
  await entrada('definirModulo', [Texto(40), SiNo], [id, apagado]);
  if (!MODULOS.some(m => m.id === id)) return { error: 'Módulo no válido' };
  return cambiar(c => c.query('select public.definir_modulo_del_dueno(p_modulo => $1, p_apagado => $2)', [id, apagado === true]), 'No se pudo cambiar');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Sectores, familias y depósitos
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function leerSectores(): Promise<Sector[]> {
  await entrada('leerSectores');
  return leer(async c => (await c.query<Sector>('select * from public.sectores order by nombre')).rows);
}

export async function agregarSector(nombre: string): Promise<Resultado> {
  await entrada('agregarSector', [Texto(300)], [nombre]);
  if (!texto(nombre, 120)) return { error: 'Escribí el nombre' };
  return cambiar(c => c.query('insert into public.sectores (nombre) values ($1)', [texto(nombre, 120)]), 'No se pudo agregar');
}

export async function renombrarSector(id: string, nombre: string): Promise<Resultado> {
  await entrada('renombrarSector', [Id, Texto(300)], [id, nombre]);
  if (!esId(id) || !texto(nombre, 120)) return { error: 'Sector no válido' };
  return cambiar(async c => algo(await c.query('update public.sectores set nombre = $2 where id = $1', [id, texto(nombre, 120)]), 'No podés cambiar este sector'),
    'No se pudo guardar el nombre');
}

export async function activarSector(id: string, activo: boolean): Promise<Resultado> {
  await entrada('activarSector', [Id, SiNo], [id, activo]);
  if (!esId(id)) return { error: 'Sector no válido' };
  return cambiar(async c => algo(await c.query('update public.sectores set activo = $2 where id = $1', [id, activo === true]), 'No podés cambiar este sector'),
    'No se pudo actualizar el sector');
}

export async function eliminarSector(id: string): Promise<Resultado> {
  await entrada('eliminarSector', [Id], [id]);
  if (!esId(id)) return { error: 'Sector no válido' };
  return cambiar(async c => algo(await c.query('delete from public.sectores where id = $1', [id]), 'No podés eliminar este sector'), 'No se pudo eliminar');
}

/** Las familias del depósito en el que se está (cada depósito tiene las suyas), y su nombre. */
export async function leerFamilias(): Promise<{ familias: Familia[]; subfamilias: Subfamilia[]; deposito?: string | null }> {
  await entrada('leerFamilias');
  return leer(async c => ({
    familias: (await c.query<Familia>('select * from public.familias order by nombre')).rows,
    subfamilias: (await c.query<Subfamilia>('select * from public.subfamilias order by nombre')).rows,
    deposito: (await c.query<{ nombre: string }>('select nombre from public.depositos where id = public.deposito_actual()')).rows[0]?.nombre ?? null,
  }));
}

export async function renombrarFamilia(id: string, nombre: string): Promise<Resultado> {
  await entrada('renombrarFamilia', [Id, Texto(300)], [id, nombre]);
  if (!esId(id) || !texto(nombre, 200)) return { error: 'Familia no válida' };
  return cambiar(async c => algo(await c.query('update public.familias set nombre = $2 where id = $1', [id, texto(nombre, 200)]), 'No podés cambiar esta familia'),
    'No se pudo guardar el nombre');
}

export async function renombrarSubfamilia(id: string, nombre: string): Promise<Resultado> {
  await entrada('renombrarSubfamilia', [Id, Texto(300)], [id, nombre]);
  if (!esId(id) || !texto(nombre, 200)) return { error: 'Subfamilia no válida' };
  return cambiar(async c => algo(await c.query('update public.subfamilias set nombre = $2 where id = $1', [id, texto(nombre, 200)]), 'No podés cambiar esta subfamilia'),
    'No se pudo guardar el nombre');
}

export async function planillaDeFamilias(): Promise<PlanillaDeFamilias | null> {
  await entrada('planillaDeFamilias');
  return leer(async c => {
    const { rows: [p] } = await c.query<{ nombre_archivo: string; storage_path: string; actualizada_at: string }>(
      'select nombre_archivo, storage_path, actualizada_at::text from public.planilla_familias where id');
    return p ? { nombre_archivo: p.nombre_archivo, actualizada_at: p.actualizada_at, url: urlPublica('documentos', p.storage_path) } : null;
  });
}

export async function datosDeFamiliasParaImportar(): Promise<DatosDeFamiliasParaImportar> {
  await entrada('datosDeFamiliasParaImportar');
  return leer(async c => ({
    familias: (await c.query('select id, codigo, nombre from public.familias')).rows,
    subfamilias: (await c.query('select id, codigo, nombre, familia_id from public.subfamilias')).rows,
  }));
}

/** Lo nuevo y lo que se completa, todo junto o nada. */
export async function importarFamilias(lote: LoteDeFamilias): Promise<Resultado> {
  await entrada('importarFamilias', [LoteFamilias], [lote]);
  const codigo = (v: unknown) => texto(v, 2).toUpperCase();
  return cambiar(async c => {
    const idPorCodigo = new Map<string, string>();
    for (const f of lote.familiasNuevas ?? []) {
      const { rows: [n] } = await c.query<{ id: string }>('insert into public.familias (codigo, nombre) values ($1, $2) returning id', [codigo(f.codigo), texto(f.nombre, 200)]);
      idPorCodigo.set(codigo(f.codigo), n.id);
    }
    for (const f of lote.familiasCompletar ?? []) {
      if (esId(f.id)) await c.query('update public.familias set nombre = $2 where id = $1', [f.id, texto(f.nombre, 200)]);
    }
    for (const s of lote.subfamiliasNuevas ?? []) {
      let familia = idPorCodigo.get(codigo(s.familiaCodigo));
      if (!familia) {
        familia = (await c.query<{ id: string }>('select id from public.familias where codigo = $1', [codigo(s.familiaCodigo)])).rows[0]?.id;
        if (!familia) throw aviso(`No existe la familia ${s.familiaCodigo}`);
        idPorCodigo.set(codigo(s.familiaCodigo), familia);
      }
      await c.query('insert into public.subfamilias (familia_id, codigo, nombre) values ($1, $2, $3)', [familia, codigo(s.codigo), texto(s.nombre, 200)]);
    }
    for (const s of lote.subfamiliasCompletar ?? []) {
      if (esId(s.id)) await c.query('update public.subfamilias set nombre = $2 where id = $1', [s.id, texto(s.nombre, 200)]);
    }
  }, 'No se pudieron guardar las familias');
}

const MAXIMO_DE_PLANILLA = 10 * 1024 * 1024;

/** La planilla de codificación que se usó, para poder bajarla después (como en Supabase, en la carpeta "documentos"). */
export async function subirPlanillaDeFamilias(datos: FormData): Promise<Resultado> {
  await entrada('subirPlanillaDeFamilias', [Formulario], [datos]);
  const archivo = datos.get('archivo');
  if (!(archivo instanceof File)) return { error: 'El archivo no es válido' };
  if (archivo.size > MAXIMO_DE_PLANILLA) return { error: 'La planilla es demasiado grande (más de 10 MB)' };
  const contenido = Buffer.from(await archivo.arrayBuffer());
  // una planilla de Excel es un zip (xlsx) o un documento de Office viejo (xls)
  const hex = contenido.subarray(0, 4).toString('hex');
  if (hex !== '504b0304' && hex !== 'd0cf11e0') return { error: 'El archivo no es una planilla de Excel' };
  const nombre = texto(archivo.name, 150).replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_') || 'planilla.xlsx';
  // cada empresa en su carpeta
  const ruta = `${(await contexto()).empresaId}/familias/${Date.now()}-${nombre}`;
  // se guarda una sola (la última): la anterior se borra, si está en el servidor (antes quedaban todas guardadas para siempre)
  let anterior: string | null = null;
  const r = await cambiar(async c => {
    const { rows: [vieja] } = await c.query<{ storage_path: string }>('select storage_path from public.planilla_familias where id');
    if (vieja && vieja.storage_path !== ruta) {
      const { rowCount } = await c.query(`delete from storage.objects where bucket_id = 'documentos' and name = $1`, [vieja.storage_path]);
      if (rowCount) anterior = vieja.storage_path;
    }
    await c.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('documentos', $1, auth.uid(), $2)`, [ruta, JSON.stringify({ size: contenido.length })]);
    await c.query(`insert into public.planilla_familias (id, storage_path, nombre_archivo, actualizada_por, actualizada_at) values (true, $1, $2, auth.uid(), now())
                   on conflict (empresa_id, deposito_id) do update set storage_path = excluded.storage_path, nombre_archivo = excluded.nombre_archivo,
                     actualizada_por = excluded.actualizada_por, actualizada_at = excluded.actualizada_at`, [ruta, nombre]);
    await guardarArchivo('documentos', ruta, contenido);
  }, 'No se pudo guardar la planilla');
  if (r.error) await borrarArchivo('documentos', ruta);
  else if (anterior) await borrarArchivo('documentos', anterior);
  return r;
}

export async function leerDepositos(): Promise<Deposito[]> {
  await entrada('leerDepositos');
  return leer(async c => (await c.query<Deposito>('select d.*, public.motivo_para_no_borrar_deposito(d.id) as motivo_no_borrar from public.depositos d order by d.codigo')).rows);
}

/** Borra un depósito vacío (solo un dueño; la base revisa que no tenga historia y que no sea el principal). */
export async function borrarDeposito(id: string): Promise<Resultado> {
  await entrada('borrarDeposito', [Id], [id]);
  if (!esId(id)) return { error: 'Depósito no válido' };
  return cambiar(c => c.query('select public.borrar_deposito($1)', [id]), 'No se pudo borrar el depósito');
}

export async function topeDeDepositos(): Promise<number> {
  await entrada('topeDeDepositos');
  return leer(async c => (await c.query<{ max_depositos: number | null }>('select max_depositos from public.licencia where id = 1')).rows[0]?.max_depositos ?? 1);
}

export async function crearDeposito(d: DatosDeposito & { prefijo: string }): Promise<Resultado> {
  await entrada('crearDeposito', [DepositoNuevo], [d]);
  return cambiar(c => c.query(`select public.crear_deposito(p_nombre => $1, p_prefijo => $2, p_color => $3, p_icono => $4,
      p_usa_retiros => $5, p_usa_reparaciones => $6)`,
    [texto(d.nombre, 120), texto(d.prefijo, 1), d.color || null, texto(d.icono, 40), d.usa_retiros === true, d.usa_reparaciones === true]),
    'No se pudo crear el depósito');
}

export async function editarDeposito(d: DatosDeposito & { id: string; activo: boolean; prefijo?: string }): Promise<Resultado> {
  await entrada('editarDeposito', [DepositoEditado], [d]);
  if (!esId(d.id)) return { error: 'Depósito no válido' };
  return cambiar(c => c.query(`select public.editar_deposito(p_id => $1, p_nombre => $2, p_color => $3, p_icono => $4, p_activo => $5, p_prefijo => $6,
      p_usa_retiros => $7, p_usa_reparaciones => $8)`,
    [d.id, texto(d.nombre, 120), d.color || null, texto(d.icono, 40), d.activo === true, d.prefijo ? texto(d.prefijo, 1) : null,
      d.usa_retiros === true, d.usa_reparaciones === true]), 'No se pudo guardar el depósito');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Usuarios. Alta, baja y contraseña: funciones de la base (web/db/03-usuarios.sql) que revisan quién lo pide; la contraseña viaja cifrada.
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function leerUsuarios(): Promise<Usuario[]> {
  await entrada('leerUsuarios');
  // con sus depósitos y el rol en cada uno (la base se los muestra a un dueño, que es quien edita usuarios)
  return leer(async c => (await c.query<{ r: Usuario }>(`
    select to_jsonb(u) || jsonb_build_object('depositos', coalesce((
             select jsonb_agg(jsonb_build_object('deposito_id', ud.deposito_id, 'rol', ud.rol) order by d.codigo)
             from public.usuarios_depositos ud join public.depositos d on d.id = ud.deposito_id where ud.usuario_id = u.id), '[]'::jsonb)) as r
    from public.usuarios_perfil u order by u.nombre`)).rows.map(x => x.r));
}

const PERMISOS = ['puede_ver_retiros', 'puede_ver_errores', 'puede_resetear_contrasenas', 'puede_ver_sugerencias', 'puede_ajustar_inventario',
  'puede_gestionar_depositos', 'puede_ver_auditoria', 'puede_ver_informe', 'puede_ver_calendario'] as const;
const datosDeUsuario = (u: UsuarioInput) => ({
  nombre: texto(u.nombre, 120), apellido: texto(u.apellido, 120),
  rol: ['user', 'admin', 'disabled'].includes(u.rol) ? u.rol : 'user',
  mantenimiento_rol: u.mantenimiento_rol === 'admin' || u.mantenimiento_rol === 'comun' ? u.mantenimiento_rol : null,
  rol_equipos: u.rol_equipos === 'admin' || u.rol_equipos === 'jefe' || u.rol_equipos === 'tecnico' || u.rol_equipos === 'consulta' ? u.rol_equipos : null,
  ...Object.fromEntries(PERMISOS.map(p => [p, u[p] === true])),
});

/** La lista de depósitos de la persona (solo si vino: un dueño no lleva lista). */
const guardarDepositos = (c: PoolClient, id: string, u: UsuarioInput) => (u.depositos
  ? c.query('select public.guardar_depositos_de_usuario($1, $2)', [id, JSON.stringify(u.depositos.filter(d => esId(d.deposito_id)).map(d => ({ deposito_id: d.deposito_id, rol: d.rol === 'admin' ? 'admin' : 'comun' })))])
  : null);

/** Como en Supabase: una sola cuenta por correo, y el cifrado de la contraseña, bcrypt. */
const cifrar = (contrasena: string) => bcrypt.hash(contrasena, 10);

async function conPool(hacer: (usuario: string) => Promise<unknown>, porDefecto: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  try {
    await hacer(usuario);
  } catch (e) {
    return { error: mensajeDe(e, porDefecto) };
  }
  revalidatePath('/', 'layout');
  return { error: null };
}

export async function crearUsuario(input: UsuarioInput, contrasena: string): Promise<Resultado> {
  await entrada('crearUsuario', [DatosDeUsuario, Contrasena], [input, contrasena]);
  const email = texto(input?.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El correo no es válido' };
  if (typeof contrasena !== 'string' || contrasena.length < LARGO_MINIMO_CLAVE || contrasena.length > 200) {
    return { error: `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres` };
  }
  const hash = await cifrar(contrasena);
  return conPool(async usuario => {
    const id = (await base.query<{ id: string }>('select servidor.crear_usuario($1, $2, $3, $4) as id', [usuario, email, hash, JSON.stringify(datosDeUsuario(input))])).rows[0]?.id;
    if (id && input.depositos) await comoUsuario(usuario, async c => { await guardarDepositos(c, id, input); });
  }, 'No se pudo crear el usuario');
}

export async function editarUsuario(id: string, input: UsuarioInput): Promise<Resultado> {
  await entrada('editarUsuario', [Id, DatosDeUsuario], [id, input]);
  if (!esId(id)) return { error: 'Usuario no válido' };
  const d = datosDeUsuario(input);
  const columnas = Object.keys(d);
  return cambiar(async c => {
    algo(await c.query(`update public.usuarios_perfil set ${columnas.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`,
      [id, ...columnas.map(k => d[k as keyof typeof d])]), 'No podés cambiar este usuario');
    await guardarDepositos(c, id, input);
  }, 'No se pudo guardar el usuario');
}

export async function activarUsuario(id: string, activo: boolean): Promise<Resultado> {
  await entrada('activarUsuario', [Id, SiNo], [id, activo]);
  if (!esId(id)) return { error: 'Usuario no válido' };
  return cambiar(async c => algo(await c.query('update public.usuarios_perfil set activo = $2 where id = $1', [id, activo === true]),
    'No podés cambiar este usuario'), 'Error al actualizar usuario');
}

export async function eliminarUsuario(id: string): Promise<Resultado> {
  await entrada('eliminarUsuario', [Id], [id]);
  if (!esId(id)) return { error: 'Usuario no válido' };
  return conPool(usuario => base.query('select servidor.eliminar_usuario($1, $2)', [usuario, id]), 'No se pudo eliminar el usuario');
}

export async function agregarDueno(id: string): Promise<Resultado> {
  await entrada('agregarDueno', [Id], [id]);
  if (!esId(id)) return { error: 'Usuario no válido' };
  return cambiar(c => c.query('select public.agregar_dueno(p_id => $1)', [id]), 'No se pudo agregar como dueño');
}

export async function quitarDueno(id: string): Promise<Resultado> {
  await entrada('quitarDueno', [Id], [id]);
  if (!esId(id)) return { error: 'Usuario no válido' };
  return cambiar(c => c.query('select public.quitar_dueno(p_id => $1)', [id]), 'No se pudo quitar como dueño');
}

export async function cambiarContrasena(id: string, contrasena: string): Promise<Resultado> {
  await entrada('cambiarContrasena', [Id, Contrasena], [id, contrasena]);
  if (!esId(id)) return { error: 'Usuario no válido' };
  if (typeof contrasena !== 'string' || contrasena.length < LARGO_MINIMO_CLAVE || contrasena.length > 200) {
    return { error: `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres` };
  }
  const hash = await cifrar(contrasena);
  return conPool(usuario => base.query('select servidor.cambiar_contrasena($1, $2, $3)', [usuario, id, hash]), 'No se pudo cambiar la contraseña');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Historial, errores, sugerencias
// ---------------------------------------------------------------------------------------------------------------------------------------------

const PARAMETROS_DEL_HISTORIAL = `p_usuario => $1::uuid, p_deposito => $2::uuid, p_sobre => $3::text[], p_acciones => $4::text[],
  p_desde => $5::timestamptz, p_hasta => $6::timestamptz, p_texto => $7`;
const valoresDelHistorial = (a: ArgumentosDelHistorial) => [
  esId(a.p_usuario) ? a.p_usuario : null, esId(a.p_deposito) ? a.p_deposito : null,
  a.p_sobre?.map(s => texto(s, 40)) ?? null, a.p_acciones?.map(s => texto(s, 40)) ?? null,
  a.p_desde ?? null, a.p_hasta ?? null, a.p_texto ? texto(a.p_texto, 200) : null,
];

export async function paginaDelHistorial(a: ArgumentosDelHistorial, despuesDe: { momento: string; id: number } | null, limite: number): Promise<FilaActividad[]> {
  await entrada('paginaDelHistorial', [FiltrosDelHistorial, DespuesDelHistorial, Numero(1, 100_000)], [a, despuesDe, limite]);
  return leer(async c => (await c.query<FilaActividad>(
    `select * from public.historial_de_actividad(${PARAMETROS_DEL_HISTORIAL}, p_antes_en => $8::timestamptz, p_antes_id => $9::bigint, p_limite => $10::int)`,
    [...valoresDelHistorial(a), despuesDe?.momento ?? null, despuesDe?.id ?? null, Math.min(Math.max(Math.trunc(limite) || 50, 1), 5000)])).rows);
}

export async function cantidadDelHistorial(a: ArgumentosDelHistorial, tope: number): Promise<number> {
  await entrada('cantidadDelHistorial', [FiltrosDelHistorial, Numero(1, 1_000_000)], [a, tope]);
  return leer(async c => (await c.query<{ n: number }>(`select public.historial_de_actividad_cantidad(${PARAMETROS_DEL_HISTORIAL}, p_tope => $8::int) as n`,
    [...valoresDelHistorial(a), Math.min(Math.max(Math.trunc(tope) || 1001, 1), 100_000)])).rows[0]?.n ?? 0);
}

export async function personasDelHistorial(): Promise<{ id: string; nombre: string }[]> {
  await entrada('personasDelHistorial');
  return leer(async c => (await c.query('select * from public.historial_personas()')).rows);
}

export async function depositosDelHistorial(usuario: string): Promise<{ id: string; nombre: string }[]> {
  await entrada('depositosDelHistorial', [TextoONulo(60)], [usuario]);
  return leer(async c => (await c.query('select * from public.historial_depositos(p_usuario => $1::uuid)', [esId(usuario) ? usuario : null])).rows);
}

const POR_PAGINA = 50;
const despuesDel = (cursor: Cursor | null) => (cursor && esId(cursor.id) ? [cursor.created_at, cursor.id] : [null, null]);

export async function paginaDeErrores(cursor: Cursor | null): Promise<ErrorLogRow[]> {
  await entrada('paginaDeErrores', [CursorDePagina], [cursor]);
  return leer(async c => (await c.query<{ r: ErrorLogRow }>(`
    select to_jsonb(e) as r from public.error_logs e
    where $1::timestamptz is null or (e.created_at, e.id) < ($1::timestamptz, $2::uuid)
    order by e.created_at desc, e.id desc limit ${POR_PAGINA}`, despuesDel(cursor))).rows.map(x => x.r));
}

export async function limpiarErrores(): Promise<Resultado> {
  await entrada('limpiarErrores');
  return cambiar(c => c.query('delete from public.error_logs where id is not null'), 'No se pudo limpiar');
}

export async function paginaDeSugerencias(cursor: Cursor | null): Promise<Sugerencia[]> {
  await entrada('paginaDeSugerencias', [CursorDePagina], [cursor]);
  return leer(async c => (await c.query<{ r: Sugerencia }>(`
    select to_jsonb(s) || jsonb_build_object('usuarioNombre', coalesce(nullif(trim(concat_ws(' ', u.nombre, u.apellido)), ''), u.email, 'Desconocido')) as r
    from public.sugerencias s left join public.usuarios_perfil u on u.id = s.usuario_id
    where $1::timestamptz is null or (s.created_at, s.id) < ($1::timestamptz, $2::uuid)
    order by s.created_at desc, s.id desc limit ${POR_PAGINA}`, despuesDel(cursor))).rows.map(x => x.r));
}

export async function limpiarSugerencias(): Promise<Resultado> {
  await entrada('limpiarSugerencias');
  return cambiar(c => c.query('delete from public.sugerencias where id is not null'), 'No se pudo limpiar');
}

/** Cuántas sugerencias llegaron desde la última vez que la persona las vio (el número rojo). La primera vez no avisa de lo que ya estaba. */
export async function sugerenciasNuevas(): Promise<number> {
  const id = await entrada('sugerenciasNuevas');
  return (await contarAvisos(id, ['sugerencias'])).sugerencias;
}

export async function marcarSugerenciasVistas(): Promise<void> {
  const id = await entrada('marcarSugerenciasVistas');
  await marcarVisto(id, 'sugerencias');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Papelera y fotos pendientes
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function leerPapelera(): Promise<FilaPapelera[]> {
  await entrada('leerPapelera');
  return leer(async c => {
    const { rows } = await c.query<Omit<FilaPapelera, 'quien'> & { quien: UsuarioBasico | null }>(`
      with filas as (
        select 'proveedor' as tipo, p.id::text as id, p.nombre as titulo, p.eliminado_por, p.eliminado_at from public.proveedores p where p.eliminado
        union all
        select 'repuesto', i.id::text, i.codigo || ' — ' || i.descripcion, i.eliminado_por, i.eliminado_at from public.items i where not i.activo
        union all
        select 'reparacion', r.id::text, 'Reparación — ' || coalesce(p.nombre, '?') || ' (' || r.motivo || ')', r.eliminado_por, r.eliminado_at
          from public.reparaciones r left join public.proveedores p on p.id = r.proveedor_id where not r.activo
        union all
        select 'envio', e.grupo_id::text, 'Envío — ' || coalesce(p.nombre, '?') || case when e.numero_documento is not null
            then ' (' || case when e.tipo_documento = 'remito' then 'Remito' else 'N. despacho' end || ' ' || e.numero_documento || ')' else '' end,
          e.eliminado_por, e.eliminado_at
          from public.rotulos_generados e left join public.proveedores p on p.id = e.proveedor_id where e.eliminado and e.vigente
      )
      select f.tipo, f.id, f.titulo, f.eliminado_por, f.eliminado_at,
        (select jsonb_build_object('nombre', u.nombre, 'apellido', u.apellido, 'email', u.email) from public.usuarios_perfil u where u.id = f.eliminado_por) as quien
      from filas f order by f.eliminado_at desc nulls last`);
    return rows.map(f => ({ ...f, quien: f.eliminado_por ? nombreUsuario(f.quien) : 'Desconocido' }));
  });
}

const TIPOS_DE_PAPELERA = new Set(['proveedor', 'repuesto', 'reparacion', 'envio']);

export async function restaurarDePapelera(tipo: FilaPapelera['tipo'], id: string): Promise<Resultado> {
  await entrada('restaurarDePapelera', [TipoDePapelera, Id], [tipo, id]);
  if (!TIPOS_DE_PAPELERA.has(tipo) || !esId(id)) return { error: 'No válido' };
  return cambiar(async c => {
    if (tipo === 'proveedor') algo(await c.query('update public.proveedores set eliminado = false, eliminado_por = null, eliminado_at = null where id = $1', [id]), 'No podés restaurarlo');
    else if (tipo === 'repuesto') algo(await c.query('update public.items set activo = true, eliminado_por = null, eliminado_at = null where id = $1', [id]), 'No podés restaurarlo');
    else if (tipo === 'reparacion') await c.query('select public.restaurar_reparacion(p_reparacion_id => $1)', [id]);
    // un envío: todas sus versiones juntas
    else algo(await c.query('update public.rotulos_generados set eliminado = false, eliminado_por = null, eliminado_at = null where grupo_id = $1', [id]), 'No podés restaurarlo');
  }, 'No se pudo restaurar');
}

export async function purgarDePapelera(tipo: FilaPapelera['tipo'], id: string): Promise<Resultado> {
  await entrada('purgarDePapelera', [TipoDePapelera, Id], [tipo, id]);
  if (!TIPOS_DE_PAPELERA.has(tipo) || !esId(id)) return { error: 'No válido' };
  return cambiar(async c => {
    if (tipo === 'envio') algo(await c.query('delete from public.rotulos_generados where grupo_id = $1', [id]), 'No podés eliminarlo');
    else {
      const tabla = tipo === 'proveedor' ? 'proveedores' : tipo === 'repuesto' ? 'items' : 'reparaciones';
      algo(await c.query(`delete from public.${tabla} where id = $1`, [id]), 'No podés eliminarlo');
    }
  }, 'No se pudo eliminar');
}

export async function leerFotosPendientes(): Promise<FilaFotoPendiente[]> {
  await entrada('leerFotosPendientes');
  return leer(async c => {
    const filas: FilaFotoPendiente[] = [];
    for (const slot of SLOTS_FOTO) {
      const k = CAMPOS_POR_SLOT[slot];
      const { rows } = await c.query<Omit<FilaFotoPendiente, 'slot' | 'quien'> & { quien: UsuarioBasico | null }>(`
        select i.id as item_id, i.codigo, i.descripcion, i.${slot} as foto_url, i.${k.subidaPor} as subida_por, i.${k.subidaAt}::text as subida_at,
          (select jsonb_build_object('nombre', u.nombre, 'apellido', u.apellido, 'email', u.email) from public.usuarios_perfil u where u.id = i.${k.subidaPor}) as quien
        from public.items i where i.${k.pendiente} and i.${slot} is not null`);
      filas.push(...rows.map(r => ({ ...r, slot, quien: nombreUsuario(r.quien) })));
    }
    return filas.sort((a, b) => new Date(b.subida_at ?? 0).getTime() - new Date(a.subida_at ?? 0).getTime());
  });
}

const esSlot = (v: unknown): v is FotoSlot => typeof v === 'string' && (SLOTS_FOTO as string[]).includes(v);
const limpiarPendiente = (slot: FotoSlot) => {
  const k = CAMPOS_POR_SLOT[slot];
  return `${k.pendiente} = false, ${k.subidaPor} = null, ${k.subidaAt} = null`;
};

/** Aprobar: la foto ya estaba visible desde que se subió; solo se saca la marca de pendiente. */
export async function aprobarFotoPendiente(itemId: string, slot: FotoSlot): Promise<Resultado> {
  await entrada('aprobarFotoPendiente', [Id, Slot], [itemId, slot]);
  if (!esId(itemId) || !esSlot(slot)) return { error: 'La foto no es válida' };
  return cambiar(async c => algo(await c.query(`update public.items set ${limpiarPendiente(slot)} where id = $1`, [itemId]), 'No podés aprobar esta foto'),
    'No se pudo aprobar');
}

/** Rechazar: se saca la foto del repuesto y, si es de acá, se borra el archivo (las de Supabase no se tocan). */
export async function rechazarFotoPendiente(itemId: string, slot: FotoSlot, url: string): Promise<Resultado> {
  await entrada('rechazarFotoPendiente', [Id, Slot, TextoONulo(2000)], [itemId, slot, url]);
  if (!esId(itemId) || !esSlot(slot)) return { error: 'La foto no es válida' };
  const ruta = rutaDeUrl('items', String(url ?? ''));
  const r = await cambiar(async c => {
    algo(await c.query(`update public.items set ${slot} = null, ${limpiarPendiente(slot)} where id = $1`, [itemId]), 'No podés eliminar esta foto');
    if (ruta) await c.query(`delete from storage.objects where bucket_id = 'items' and name = $1`, [ruta]);
  }, 'No se pudo eliminar');
  if (!r.error && ruta) await borrarArchivo('items', ruta);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Repuestos (importar el stock desde Excel) y el asistente inicial
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function datosParaImportarStock(): Promise<DatosParaImportarStock> {
  await entrada('datosParaImportarStock');
  return leer(async c => ({
    familias: (await c.query('select id, codigo from public.familias')).rows,
    subfamilias: (await c.query('select id, codigo, familia_id from public.subfamilias')).rows,
    existentes: (await c.query('select codigo, descripcion, stock::float8 as stock, stock_minimo::float8 as stock_minimo, punto_pedido::float8 as punto_pedido from public.items')).rows,
  }));
}

/** La base actualiza los repuestos y registra las diferencias de stock como ajustes ("Importación de stock desde Excel"). */
export async function importarStock(filas: FilaAImportar[]): Promise<Resultado> {
  await entrada('importarStock', [FilasDeStock], [filas]);
  if (!Array.isArray(filas) || filas.length > 50_000) return { error: 'Demasiadas filas' };
  return cambiar(async c => {
    for (let i = 0; i < filas.length; i += 2500) await c.query('select public.aplicar_importacion_stock(p_filas => $1::jsonb)', [JSON.stringify(filas.slice(i, i + 2500))]);
  }, 'Error al guardar los cambios en la base.');
}

export async function conteosIniciales(): Promise<ConteosIniciales> {
  await entrada('conteosIniciales');
  return leer(async c => {
    // (una tabla de un módulo apagado cuenta 0: el asistente tampoco muestra ese paso)
    const contar = async (tabla: string) => Number((await c.query<{ n: string }>(`select count(*) as n from public.${tabla}`)).rows[0]?.n ?? 0);
    return { sectores: await contar('sectores'), familias: await contar('familias'), repuestos: await contar('items'), usuarios: await contar('usuarios_perfil') };
  });
}

export async function cerrarConfiguracionInicial(): Promise<Resultado> {
  await entrada('cerrarConfiguracionInicial');
  return cambiar(async c => algo(await c.query('update public.configuracion set inicial_cerrada_at = now() where id = 1'), 'No podés cerrar el asistente'),
    'No se pudo cerrar el asistente');
}

/** La fila de configuración, para la pantalla (la lee quien tiene la sesión, con sus reglas). */
export async function leerConfiguracion(): Promise<Configuracion | undefined> {
  await entrada('leerConfiguracion');
  return leer(async c => (await c.query<{ r: Configuracion }>('select to_jsonb(k) as r from public.configuracion k where id = 1')).rows[0]?.r);
}
