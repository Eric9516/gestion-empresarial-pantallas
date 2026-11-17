import type { AccionesDeMovimiento } from '@/features/ajustes/NuevoMovimientoModal';
import type { AccionesDeFotos } from '@/features/items/FotoCarousel';
import type { AccionesDeRepuesto } from '@/features/items/FormularioDeRepuesto';
import type { AccionesDeProveedoresDelRepuesto } from '@/features/items/ProveedoresDelRepuesto';
import { ConflictoDeEdicion } from '@/lib/conflicto';
import { registrarError } from '~/componentes/errores/registrar';
import { listaDeProveedores } from '../directorio/acciones';
import {
  agregarProveedorAlRepuesto, buscarParaElegir, borrarFotoDeRepuesto, crearFamilia, crearMovimiento, crearSubfamilia, guardarRepuesto, leerRepuestoAhora,
  leerRepuestoFresco, proveedoresDelRepuesto, quitarProveedorDelRepuesto, repuestosDeSubfamilia, subirFotoDeRepuesto, usarComoMiniatura,
} from './acciones';

// Las acciones que las pantallas compartidas (las mismas de la app de Vite) usan en Next: llaman al servidor y, si la base dice que no,
// lanzan el error con su texto (las acciones del servidor lo devuelven en vez de lanzarlo, porque Next no deja pasar el texto de un error).

const conError = async (r: Promise<{ error: string | null }>) => { const { error } = await r; if (error) throw new Error(error); };

export const ACCIONES_DE_FOTOS: AccionesDeFotos = {
  subir: (id, slot, foto) => {
    const datos = new FormData();
    datos.set('id', id);
    datos.set('slot', slot);
    datos.set('foto', foto, 'foto.jpg');
    return conError(subirFotoDeRepuesto(datos));
  },
  borrar: (id, slot, url) => conError(borrarFotoDeRepuesto(id, slot, url)),
  usarComoMiniatura: (id, _fotos, slot) => conError(usarComoMiniatura(id, slot)),
};

export const ACCIONES_DE_MOVIMIENTO: AccionesDeMovimiento = {
  crear: async m => {
    const { comprobante, error } = await crearMovimiento(m);
    if (error || !comprobante) throw new Error(error ?? 'No se pudo registrar el movimiento');
    return { comprobante };
  },
  leerRepuesto: leerRepuestoAhora,
  buscarRepuestos: buscarParaElegir,
  registrarError,
};

export const ACCIONES_DE_REPUESTO: AccionesDeRepuesto = {
  leerFresco: leerRepuestoFresco,
  repuestosDeSubfamilia,
  guardar: async r => {
    const g = await guardarRepuesto(r);
    if (g.conflicto) throw new ConflictoDeEdicion('este artículo');
    if (g.error || !g.id || !g.codigo) throw new Error(g.error ?? 'No se pudo guardar');
    return { id: g.id, codigo: g.codigo };
  },
  crearFamilia: async (codigo, nombre) => {
    const { familia, error } = await crearFamilia(codigo, nombre);
    if (error || !familia) throw new Error(error ?? 'No se pudo crear la familia');
    return familia;
  },
  crearSubfamilia: async (familiaId, codigo, nombre) => {
    const { subfamilia, error } = await crearSubfamilia(familiaId, codigo, nombre);
    if (error || !subfamilia) throw new Error(error ?? 'No se pudo crear la subfamilia');
    return subfamilia;
  },
};

export const ACCIONES_DE_PROVEEDORES_DEL_REPUESTO: AccionesDeProveedoresDelRepuesto = {
  leer: proveedoresDelRepuesto,
  proveedores: listaDeProveedores,
  agregar: (itemId, proveedorId) => conError(agregarProveedorAlRepuesto(itemId, proveedorId)),
  quitar: vinculoId => conError(quitarProveedorDelRepuesto(vinculoId)),
  registrarError: ACCIONES_DE_MOVIMIENTO.registrarError,
};
