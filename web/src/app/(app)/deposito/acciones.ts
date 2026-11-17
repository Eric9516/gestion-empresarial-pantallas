'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { MovimientoNuevo } from '@/features/ajustes/NuevoMovimientoModal';
import type { Ajuste } from '@/features/ajustes/tipos';
import type { Familia, Subfamilia } from '@/features/familias/tipos';
import type { RepuestoAGuardar, RepuestoFresco } from '@/features/items/FormularioDeRepuesto';
import type { MovimientoFila } from '@/features/items/tipos';
import type { ProveedorDeItem } from '@/features/items/tipos';
import { SLOTS_FOTO, type FotoSlot } from '@/features/items/slotsDeFoto';
import type { EstadoReposicion } from '@/features/items/reposicion';
import type { FiltrosDeReposicion, InformeDeReposicion, Item, RepuestoDeLista } from '@/features/items/tipos';
import type { RetiroAConfirmar, StockQueFalta } from '@/features/retiros/PanelDeRetiro';
import type { RetiroHistorial } from '@/features/retiros/tipos';
import type { UsuarioBasico } from '@/lib/nombreUsuario';
import { contexto } from '~/lib/contexto';
import { borrarArchivo, guardarArchivo, rutaDeUrl, urlPublica } from '~/lib/archivos';
import { comoUsuario } from '~/lib/db';
import { paginaDeMovimientos as leerPaginaDeMovimientos, type FiltrosDeMovimientosEnLaBase } from '~/lib/movimientos';
import { buscarRepuestosEnLaBase, fichaDeStock, informeDeReposicion } from '~/lib/repuestos';
import { paginaDeRetiros as leerPaginaDeRetiros, retirosParaExportar as leerRetirosParaExportar, type Cursor, type FiltrosDeLaBase } from '~/lib/retiros';

import { Cantidad, Celda, CursorDePagina, Fecha, FechaONula, Formulario, Id, IdONulo, Lista, Numero, SiNoONulo, Texto, TextoONulo, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';

// Lo que las pantallas del Depósito le piden al servidor desde el navegador. Cada acción vuelve a mirar quién tiene la sesión
// y la base aplica sus reglas: desde el navegador no se puede pedir nada que esa persona no pueda hacer.

const LIMITE_DE_LINEAS = 200;

// Lo que reciben las acciones (lo revisa entrada(): ver ~/lib/entrada)
const LineasParaVerificar = Lista(z.object({ item_id: Id, codigo: TextoONulo(100), cantidad: Cantidad }), 1000);
const Retiro = z.object({
  sectorId: TextoONulo(60), observacionGeneral: TextoONulo(2000),
  items: Lista(z.object({ item_id: Id, cantidad: Cantidad, observacion: TextoONulo(2000) }), 1000),
});
const FiltrosDeRetiros = z.object({ texto: TextoONulo(500), desde: FechaONula, hasta: FechaONula, usuario: TextoONulo(60) });
const RetirosParaExportar = z.union([z.object({ pendientes: z.literal(true) }), z.object({ desde: Fecha, hasta: Fecha })]);
const FiltrosDeMovimientos = z.object({ texto: TextoONulo(500), filtro: TextoONulo(40), desde: FechaONula, hasta: FechaONula });
const Movimiento = z.object({
  clase: z.enum(['carga', 'ajuste']), fecha: Fecha, motivo: TextoONulo(500), referencia: TextoONulo(500), observaciones: TextoONulo(2000),
  lineas: Lista(z.object({ item_id: Id, tipo: z.enum(['suma', 'resta']), cantidad: Cantidad }), 1000),
});
const Repuesto = z.object({
  id: IdONulo,
  input: z.object({
    familia_id: TextoONulo(60), subfamilia_id: TextoONulo(60), numero: Celda, descripcion: TextoONulo(2000), ubicacion: TextoONulo(500),
    unidad: TextoONulo(60), stock: Cantidad.nullish(), stock_minimo: Cantidad.nullish(), punto_pedido: Cantidad.nullish(),
    detalles: TextoONulo(5000), palabras_clave: TextoONulo(2000),
  }),
  familia: z.object({ id: Id }), subfamilia: z.object({ id: Id }),
  version: TextoONulo(60), numeroAutomatico: SiNoONulo, prefijo: TextoONulo(10),
});
const FiltrosDelInforme = z.object({ texto: TextoONulo(500), familiaId: TextoONulo(60), estado: TextoONulo(40), limite: Numero(0, 100_000).nullish() });
const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

// Los avisos de la base (raise exception) ya están escritos para la persona; lo demás se muestra sin detalles internos.
// (Se devuelven en vez de lanzarse: Next no deja pasar al navegador el texto de un error.)

/** El stock de ahora de algunos repuestos (los del carrito). */
export async function stockDe(ids: string[]): Promise<Record<string, number | null>> {
  const usuario = await entrada('stockDe', [Lista(Id, 1000)], [ids]);
  const validos = ids.filter(esId).slice(0, LIMITE_DE_LINEAS);
  if (!validos.length) return {};
  return comoUsuario(usuario, async c => {
    const { rows } = await c.query<{ id: string; stock: string | null }>('select id, stock from public.items where id = any($1::uuid[])', [validos]);
    return Object.fromEntries(rows.map(r => [r.id, r.stock === null ? null : Number(r.stock)]));
  });
}

/** Las líneas que piden más de lo que hay (para avisar de todas juntas antes de confirmar). */
export async function verificarStock(lineas: { item_id: string; codigo: string; cantidad: number }[]): Promise<StockQueFalta[]> {
  await entrada('verificarStock', [LineasParaVerificar], [lineas]);
  const hay = await stockDe(lineas.map(l => l.item_id));
  return lineas.filter(l => l.cantidad > (hay[l.item_id] ?? 0)).map(l => ({ codigo: l.codigo, hay: hay[l.item_id] ?? 0, pide: l.cantidad }));
}

/**
 * Confirma el retiro: una sola operación en la base (el retiro y todas sus líneas, o nada). La base no deja que el stock quede negativo.
 * Devuelve el problema en vez de lanzarlo: Next no deja pasar al navegador el texto de un error, y este ("no hay stock") hay que mostrarlo.
 */
export async function confirmarRetiro(r: RetiroAConfirmar): Promise<{ error: string | null }> {
  const usuario = await entrada('confirmarRetiro', [Retiro], [r]);
  if (!esId(r.sectorId)) return { error: 'Elegí el sector antes de confirmar' };
  const lineas = r.items.slice(0, LIMITE_DE_LINEAS).map(l => ({ item_id: l.item_id, cantidad: Number(l.cantidad), observacion: String(l.observacion ?? '').slice(0, 500) }));
  if (!lineas.length || lineas.some(l => !esId(l.item_id) || !Number.isFinite(l.cantidad) || l.cantidad <= 0)) return { error: 'Hay una línea del retiro que no es válida' };
  try {
    await comoUsuario(usuario, c => c.query('select public.confirmar_retiro($1, $2, $3::jsonb)',
      [r.sectorId, String(r.observacionGeneral ?? '').slice(0, 500), JSON.stringify(lineas)]));
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo confirmar el retiro. Probá de nuevo.') };
  }
  revalidatePath('/deposito', 'layout');
  return { error: null };
}

/** Una tanda de la ficha de stock de un repuesto (la primera con antes = null). */
export async function movimientos(itemId: string, antes: number | null): Promise<MovimientoFila[]> {
  const usuario = await entrada('movimientos', [Id, Numero().nullish()], [itemId, antes]);
  if (!esId(itemId) || (antes !== null && !Number.isFinite(antes))) return [];
  return fichaDeStock(usuario, itemId, antes);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Retiros (historial): leer de a páginas y exportar. Un retiro no se corrige ni se borra (lo que vuelve es una carga de stock).
// ---------------------------------------------------------------------------------------------------------------------------------------------

/** Una página del historial, desde el último retiro de la anterior (o la primera, con null). */
export async function paginaDeRetiros(filtros: FiltrosDeLaBase, despuesDe: Cursor | null): Promise<RetiroHistorial[]> {
  const usuario = await entrada('paginaDeRetiros', [FiltrosDeRetiros, CursorDePagina], [filtros, despuesDe]);
  if (filtros.usuario && !esId(filtros.usuario)) return [];
  return leerPaginaDeRetiros(usuario, filtros, despuesDe);
}

/** Los retiros a exportar (los pendientes o los de un período) y los nombres de quienes los hicieron. El Excel se arma en el navegador. */
export async function retirosAExportar(filtro: { pendientes: true } | { desde: string; hasta: string }) {
  const usuario = await entrada('retirosAExportar', [RetirosParaExportar], [filtro]);
  const retiros = await leerRetirosParaExportar(usuario, filtro);
  const ids = [...new Set(retiros.map(r => r.usuario_id))];
  const usuarios = !ids.length ? [] : await comoUsuario(usuario, async c =>
    (await c.query<UsuarioBasico>('select id, nombre, apellido, email from public.usuarios_perfil where id = any($1::uuid[])', [ids])).rows);
  return { retiros, usuarios };
}

/** Marca como exportados los retiros que ya se descargaron (la próxima vez, "exportar pendientes" no los vuelve a traer). */
export async function marcarRetirosExportados(ids: string[]): Promise<void> {
  const usuario = await entrada('marcarRetirosExportados', [Lista(Id, 50_000)], [ids]);
  const validos = ids.filter(esId);
  if (!validos.length) return;
  await comoUsuario(usuario, c => c.query('update public.retiros set exportado = true where id = any($1::uuid[])', [validos]));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Movimientos de stock (cargas y ajustes): leer de a páginas, crear y anular. La base decide quién puede (ajustar: dueño o autorizado; anular: dueño).
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function paginaDeMovimientos(filtros: FiltrosDeMovimientosEnLaBase, despuesDe: Cursor | null): Promise<Ajuste[]> {
  const usuario = await entrada('paginaDeMovimientos', [FiltrosDeMovimientos, CursorDePagina], [filtros, despuesDe]);
  return leerPaginaDeMovimientos(usuario, filtros, despuesDe);
}

/** Registra una carga o un ajuste (todo o nada) y devuelve su comprobante, o el aviso de la base. */
export async function crearMovimiento(m: MovimientoNuevo): Promise<{ comprobante: string | null; error: string | null }> {
  const usuario = await entrada('crearMovimiento', [Movimiento], [m]);
  const lineas = m.lineas.slice(0, LIMITE_DE_LINEAS).map(l => ({ item_id: l.item_id, tipo: l.tipo, cantidad: Number(l.cantidad) }));
  if (!lineas.length || lineas.some(l => !esId(l.item_id) || !['suma', 'resta'].includes(l.tipo) || !Number.isFinite(l.cantidad) || l.cantidad <= 0)) {
    return { comprobante: null, error: 'Hay una línea del movimiento que no es válida' };
  }
  try {
    const r = await comoUsuario(usuario, async c => (await c.query<{ r: { comprobante: string } }>(
      'select public.crear_movimiento_stock($1, $2, $3, $4, $5, $6::jsonb) as r',
      [m.clase, m.fecha || null, m.motivo.slice(0, 200), m.referencia.slice(0, 200), m.observaciones.slice(0, 1000), JSON.stringify(lineas)])).rows[0].r);
    revalidatePath('/deposito', 'layout');
    return { comprobante: r.comprobante, error: null };
  } catch (e) {
    return { comprobante: null, error: mensajeDe(e, 'No se pudo registrar el movimiento. Probá de nuevo.') };
  }
}

/** Anula un comprobante: el stock vuelve a como estaba. No se borra (queda marcado, con quién y por qué). */
export async function anularMovimiento(id: string, motivo: string): Promise<{ error: string | null }> {
  const usuario = await entrada('anularMovimiento', [Id, TextoONulo(1000)], [id, motivo]);
  if (!esId(id)) return { error: 'El comprobante no es válido' };
  try {
    await comoUsuario(usuario, c => c.query('select public.anular_ajuste_inventario($1, $2)', [id, motivo.slice(0, 500)]));
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo anular. Probá de nuevo.') };
  }
  revalidatePath('/deposito', 'layout');
  return { error: null };
}

/** El stock y la unidad de un repuesto tal como están ahora (al agregarlo a un movimiento). */
export async function leerRepuestoAhora(id: string): Promise<{ stock: number | null; unidad: string | null }> {
  const usuario = await entrada('leerRepuestoAhora', [Id], [id]);
  if (!esId(id)) throw new Error('Artículo no válido');
  return comoUsuario(usuario, async c => {
    const { rows: [r] } = await c.query<{ stock: string | null; unidad: string | null }>('select stock, unidad from public.items where id = $1', [id]);
    if (!r) throw new Error('No se encontró el artículo');
    return { stock: r.stock === null ? null : Number(r.stock), unidad: r.unidad };
  });
}

/** El artículo de un código QR escaneado (el código exacto, solo los activos), o null si no está en el catálogo. */
export async function buscarPorCodigo(codigo: string): Promise<{ id: string; codigo: string; descripcion: string } | null> {
  const usuario = await entrada('buscarPorCodigo', [Texto(200)], [codigo]);
  const limpio = codigo.trim();
  if (!limpio) return null;
  return comoUsuario(usuario, async c => (await c.query<{ id: string; codigo: string; descripcion: string }>(
    'select id, codigo, descripcion from public.items where codigo = $1 and activo limit 1', [limpio])).rows[0] ?? null);
}

/** Repuestos para elegir en un selector (los primeros que coinciden con lo escrito). */
export async function buscarParaElegir(texto: string, limite: number): Promise<RepuestoDeLista[]> {
  const usuario = await entrada('buscarParaElegir', [TextoONulo(500), Numero(0, 1000)], [texto, limite]);
  return buscarRepuestosEnLaBase(usuario, texto, Math.min(Math.max(limite, 1), 50));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Fotos del repuesto y eliminarlo. Las fotos nuevas se guardan en el servidor (ver ~/lib/archivos); las que ya estaban siguen en Supabase.
// Quién puede subir o borrar lo decide la base, con las mismas reglas que en Supabase (storage.objects).
// ---------------------------------------------------------------------------------------------------------------------------------------------

const MAXIMO_DE_FOTO = 5 * 1024 * 1024;
const esSlot = (v: unknown): v is FotoSlot => typeof v === 'string' && (SLOTS_FOTO as string[]).includes(v);
// lo que se sube tiene que ser una imagen de verdad (se mira cómo empieza el archivo, no lo que dice el navegador)
const tipoDeImagen = (b: Buffer) =>
  b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b.subarray(0, 4).toString('hex') === '89504e47' ? 'png' : b.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;

export async function subirFotoDeRepuesto(datos: FormData): Promise<{ error: string | null }> {
  const usuario = await entrada('subirFotoDeRepuesto', [Formulario], [datos]);
  const id = datos.get('id'), slot = datos.get('slot'), foto = datos.get('foto');
  if (!esId(id) || !esSlot(slot) || !(foto instanceof Blob)) return { error: 'La foto no es válida' };
  if (foto.size > MAXIMO_DE_FOTO) return { error: 'La foto es demasiado grande (más de 5 MB)' };
  const contenido = Buffer.from(await foto.arrayBuffer());
  const tipo = tipoDeImagen(contenido);
  if (!tipo) return { error: 'El archivo no es una imagen' };
  // cada empresa en su carpeta
  const ruta = `${(await contexto()).empresaId}/${id}/${slot}-${Date.now()}.${tipo}`;
  try {
    await comoUsuario(usuario, async c => {
      // el registro primero: si esta persona no puede subir fotos, la base dice que no y no se escribe nada
      await c.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('items', $1, auth.uid(), $2)`,
        [ruta, JSON.stringify({ size: contenido.length, mimetype: `image/${tipo === 'jpg' ? 'jpeg' : tipo}` })]);
      await guardarArchivo('items', ruta, contenido);
      const { rowCount } = await c.query(`update public.items set ${slot} = $2 where id = $1`, [id, urlPublica('items', ruta)]);
      if (!rowCount) throw Object.assign(new Error('No se encontró el artículo'), { code: 'P0001' });
    });
  } catch (e) {
    await borrarArchivo('items', ruta);
    return { error: mensajeDe(e, 'No se pudo subir la foto. Probá de nuevo.') };
  }
  revalidatePath('/deposito', 'layout');
  return { error: null };
}

export async function borrarFotoDeRepuesto(id: string, slot: string, url: string): Promise<{ error: string | null }> {
  const usuario = await entrada('borrarFotoDeRepuesto', [Id, Texto(20), TextoONulo(2000)], [id, slot, url]);
  if (!esId(id) || !esSlot(slot)) return { error: 'La foto no es válida' };
  // las fotos de Supabase (las que ya estaban) no se tocan allá: acá solo se saca del repuesto
  const ruta = rutaDeUrl('items', url);
  try {
    await comoUsuario(usuario, async c => {
      if (ruta) await c.query(`delete from storage.objects where bucket_id = 'items' and name = $1`, [ruta]);
      const { rowCount } = await c.query(`update public.items set ${slot} = null where id = $1`, [id]);
      if (!rowCount) throw Object.assign(new Error('No podés cambiar las fotos de este artículo'), { code: 'P0001' });
    });
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo eliminar la foto. Probá de nuevo.') };
  }
  if (ruta) await borrarArchivo('items', ruta);
  revalidatePath('/deposito', 'layout');
  return { error: null };
}

/** La foto de ese lugar pasa a ser la miniatura (la de la lista) y la miniatura va a su lugar. */
export async function usarComoMiniatura(id: string, slot: string): Promise<{ error: string | null }> {
  const usuario = await entrada('usarComoMiniatura', [Id, Texto(20)], [id, slot]);
  if (!esId(id) || !esSlot(slot) || slot === 'foto_url') return { error: 'La foto no es válida' };
  try {
    const { rowCount } = await comoUsuario(usuario, c => c.query(`update public.items set foto_url = ${slot}, ${slot} = foto_url where id = $1`, [id]));
    if (!rowCount) return { error: 'No podés cambiar las fotos de este artículo' };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo cambiar la miniatura. Probá de nuevo.') };
  }
  revalidatePath('/deposito', 'layout');
  return { error: null };
}

/** Lo manda a la Papelera (no lo borra): queda quién y cuándo, y se puede recuperar hasta la baja definitiva. */
export async function eliminarRepuesto(id: string): Promise<{ error: string | null }> {
  const usuario = await entrada('eliminarRepuesto', [Id], [id]);
  if (!esId(id)) return { error: 'El artículo no es válido' };
  try {
    const { rowCount } = await comoUsuario(usuario, c =>
      c.query('update public.items set activo = false, eliminado_por = auth.uid(), eliminado_at = now() where id = $1 and activo', [id]));
    if (!rowCount) return { error: 'No podés eliminar este artículo' };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo eliminar. Probá de nuevo.') };
  }
  revalidatePath('/deposito', 'layout');
  return { error: null };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Alta y edición del repuesto, y familias o subfamilias nuevas desde el formulario. Los registros se leen con to_jsonb: llegan igual que de
// Supabase (números como números, fechas con todos sus decimales), y la versión del repuesto (updated_at) se compara exacta.
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function leerRepuestoFresco(id: string): Promise<RepuestoFresco> {
  const usuario = await entrada('leerRepuestoFresco', [Id], [id]);
  if (!esId(id)) throw new Error('Artículo no válido');
  const fila = await comoUsuario(usuario, async c => (await c.query<{ r: RepuestoFresco }>('select to_jsonb(i) as r from public.items i where i.id = $1', [id])).rows[0]);
  if (!fila) throw new Error('No se encontró el artículo');
  return fila.r;
}

export async function repuestosDeSubfamilia(familiaId: string, subfamiliaId: string): Promise<Item[]> {
  const usuario = await entrada('repuestosDeSubfamilia', [Id, Id], [familiaId, subfamiliaId]);
  if (!esId(familiaId) || !esId(subfamiliaId)) return [];
  return comoUsuario(usuario, async c => (await c.query<{ r: Item }>(`
    select to_jsonb(i) || jsonb_build_object('familias', jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nombre', f.nombre),
                                             'subfamilias', jsonb_build_object('id', s.id, 'codigo', s.codigo, 'nombre', s.nombre)) as r
    from public.items i join public.familias f on f.id = i.familia_id join public.subfamilias s on s.id = i.subfamilia_id
    where i.familia_id = $1 and i.subfamilia_id = $2 limit 5000`, [familiaId, subfamiliaId])).rows.map(x => x.r));
}

type ResultadoDeGuardar = { id: string | null; codigo: string | null; conflicto: boolean; error: string | null };
const noGuardado = (error: string): ResultadoDeGuardar => ({ id: null, codigo: null, conflicto: false, error });

/** Crea o actualiza. Al editar, solo si nadie lo cambió desde que se abrió (si no: conflicto, y el formulario se vuelve a llenar con lo nuevo). */
export async function guardarRepuesto(g: RepuestoAGuardar): Promise<ResultadoDeGuardar> {
  const usuario = await entrada('guardarRepuesto', [Repuesto], [g]);
  const i = g.input;
  const numero = String(i.numero ?? '').trim();
  if (!esId(i.familia_id) || !esId(i.subfamilia_id) || !/^\d{1,5}$/.test(numero) || !String(i.descripcion ?? '').trim()) {
    return noGuardado('Familia, subfamilia, número y descripción son obligatorios');
  }
  const n = (v: number | null) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const texto = (v: string | null | undefined, largo: number) => String(v ?? '').slice(0, largo).trim();
  try {
    const r = await comoUsuario(usuario, async (c): Promise<ResultadoDeGuardar> => {
      if (g.id) {
        if (!esId(g.id) || !g.version) return noGuardado('Falta la versión del artículo para guardar los cambios');
        // el código se arma con lo que hay en la base (la letra del depósito no cambia al editar), no con lo que manda el navegador
        const { rows: [d] } = await c.query<{ letra: string; familia: string; subfamilia: string }>(`
          select left(i.codigo, 1) as letra, f.codigo as familia, s.codigo as subfamilia
          from public.items i, public.familias f, public.subfamilias s where i.id = $1 and f.id = $2 and s.id = $3 and s.familia_id = f.id`,
          [g.id, i.familia_id, i.subfamilia_id]);
        if (!d) return noGuardado('La familia o la subfamilia no son válidas');
        const numeroPad = numero.padStart(5, '0');
        const codigo = `${d.letra}${d.familia}${d.subfamilia}${numeroPad}`;
        const { rowCount } = await c.query(`
          update public.items set codigo = $3, numero = $4, descripcion = $5, familia_id = $6, subfamilia_id = $7, ubicacion = $8, unidad = $9,
                 stock_minimo = $10, punto_pedido = $11, detalles = $12, palabras_clave = $13
          where id = $1 and updated_at = $2::timestamptz`,
          [g.id, g.version, codigo, numeroPad, texto(i.descripcion, 500), i.familia_id, i.subfamilia_id, texto(i.ubicacion, 120) || null,
            texto(i.unidad, 20) || 'Uni', n(i.stock_minimo) ?? 0, n(i.punto_pedido) ?? 0, texto(i.detalles, 2000) || null, texto(i.palabras_clave, 500) || null]);
        if (!rowCount) return { id: null, codigo: null, conflicto: true, error: null };
        return { id: g.id, codigo, conflicto: false, error: null };
      }
      // al crear, la base asigna el número si no se eligió uno (dos altas a la vez nunca reciben el mismo)
      const { rows: [creado] } = await c.query<{ r: { id: string; codigo: string } }>(
        'select to_jsonb(x) as r from public.crear_repuesto($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null, $11) x',
        [i.familia_id, i.subfamilia_id, g.numeroAutomatico ? null : numero, texto(i.descripcion, 500), texto(i.ubicacion, 120),
          n(i.stock), n(i.stock_minimo), n(i.punto_pedido), texto(i.detalles, 2000), texto(i.unidad, 20) || 'Uni', texto(i.palabras_clave, 500) || null]);
      return { id: creado.r.id, codigo: creado.r.codigo, conflicto: false, error: null };
    });
    if (r.id) revalidatePath('/deposito', 'layout');
    return r;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return noGuardado('Ya existe un artículo con ese código: elegí otro número');
    return noGuardado(mensajeDe(e, 'No se pudo guardar. Probá de nuevo.'));
  }
}

export async function crearFamilia(codigo: string, nombre: string): Promise<{ familia: Familia | null; error: string | null }> {
  const usuario = await entrada('crearFamilia', [Texto(20), Texto(300)], [codigo, nombre]);
  try {
    const familia = await comoUsuario(usuario, async c => (await c.query<{ r: Familia }>(
      'insert into public.familias (codigo, nombre) values ($1, $2) returning to_jsonb(familias) as r', [codigo.trim(), nombre.trim()])).rows[0].r);
    revalidatePath('/deposito', 'layout');
    return { familia, error: null };
  } catch (e) {
    return { familia: null, error: (e as { code?: string }).code === '23505' ? 'Ya existe una familia con ese código' : mensajeDe(e, 'No se pudo crear la familia') };
  }
}

export async function crearSubfamilia(familiaId: string, codigo: string, nombre: string): Promise<{ subfamilia: Subfamilia | null; error: string | null }> {
  const usuario = await entrada('crearSubfamilia', [TextoONulo(60), Texto(20), Texto(300)], [familiaId, codigo, nombre]);
  if (!esId(familiaId)) return { subfamilia: null, error: 'Elegí primero una familia' };
  try {
    const subfamilia = await comoUsuario(usuario, async c => (await c.query<{ r: Subfamilia }>(
      'insert into public.subfamilias (familia_id, codigo, nombre) values ($1, $2, $3) returning to_jsonb(subfamilias) as r',
      [familiaId, codigo.trim(), nombre.trim()])).rows[0].r);
    revalidatePath('/deposito', 'layout');
    return { subfamilia, error: null };
  } catch (e) {
    return { subfamilia: null, error: (e as { code?: string }).code === '23505' ? 'Ya existe esa subfamilia en la familia' : mensajeDe(e, 'No se pudo crear la subfamilia') };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Informe de reposición: leer y marcar el estado (presupuesto pedido, en compras) de varios repuestos.
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function pedirInforme(f: FiltrosDeReposicion): Promise<InformeDeReposicion> {
  const usuario = await entrada('pedirInforme', [FiltrosDelInforme], [f]);
  if (f.familiaId && !esId(f.familiaId)) return { filas: [], total: 0, totalSinStock: 0 };
  return informeDeReposicion(usuario, f);
}

export async function marcarEstadoDeReposicion(ids: string[], estado: EstadoReposicion | null): Promise<{ error: string | null }> {
  const usuario = await entrada('marcarEstadoDeReposicion', [Lista(Id, 5000), z.enum(['presupuesto', 'compras']).nullable()], [ids, estado]);
  const validos = ids.filter(esId).slice(0, 5000);
  if (estado !== null && !['presupuesto', 'compras'].includes(estado)) return { error: 'Estado no válido' };
  try {
    await comoUsuario(usuario, c => c.query('update public.items set estado_reposicion = $2 where id = any($1::uuid[])', [validos, estado]));
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo actualizar el estado.') };
  }
  revalidatePath('/deposito/informe');
  return { error: null };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Proveedores del repuesto (en su detalle, para quien administra el Depósito).
// ---------------------------------------------------------------------------------------------------------------------------------------------

/** Los que están en la Papelera no se listan: el vínculo queda y reaparece si se restaura el proveedor. */
export async function proveedoresDelRepuesto(itemId: string): Promise<ProveedorDeItem[]> {
  const usuario = await entrada('proveedoresDelRepuesto', [Id], [itemId]);
  if (!esId(itemId)) return [];
  return comoUsuario(usuario, async c => (await c.query<ProveedorDeItem>(`
    select v.id, jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rubro', p.rubro) as proveedor
    from public.item_proveedores v join public.proveedores p on p.id = v.proveedor_id
    where v.item_id = $1 and not p.eliminado order by p.nombre`, [itemId])).rows);
}

export async function agregarProveedorAlRepuesto(itemId: string, proveedorId: string): Promise<{ error: string | null }> {
  const usuario = await entrada('agregarProveedorAlRepuesto', [Id, Id], [itemId, proveedorId]);
  if (!esId(itemId) || !esId(proveedorId)) return { error: 'Proveedor no válido' };
  try {
    await comoUsuario(usuario, c => c.query('insert into public.item_proveedores (item_id, proveedor_id) values ($1, $2)', [itemId, proveedorId]));
  } catch (e) {
    return { error: (e as { code?: string }).code === '23505' ? 'Ese proveedor ya está en el artículo' : mensajeDe(e, 'No se pudo agregar el proveedor') };
  }
  return { error: null };
}

export async function quitarProveedorDelRepuesto(vinculoId: string): Promise<{ error: string | null }> {
  const usuario = await entrada('quitarProveedorDelRepuesto', [Id], [vinculoId]);
  if (!esId(vinculoId)) return { error: 'Proveedor no válido' };
  try {
    const { rowCount } = await comoUsuario(usuario, c => c.query('delete from public.item_proveedores where id = $1', [vinculoId]));
    if (!rowCount) return { error: 'No podés quitar este proveedor' };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo quitar el proveedor') };
  }
  return { error: null };
}

/** Da por revisado lo que una OT de Mantenimiento usó y no se pudo descontar (lo hace quien administra el Depósito). */
export async function revisarFaltanteDeMantenimiento(id: string): Promise<{ error: string | null }> {
  const usuario = await entrada('revisarFaltanteDeMantenimiento', [Id], [id]);
  if (!esId(id)) return { error: 'No válido' };
  try {
    await comoUsuario(usuario, c => c.query('select public.revisar_faltante($1)', [id]));
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo marcar como revisado') };
  }
  revalidatePath('/deposito');
  return { error: null };
}
