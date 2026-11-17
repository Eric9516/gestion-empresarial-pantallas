'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import PantallaDeCalendario from '@/features/mantenimiento/PantallaDeCalendario';
import PantallaDeInicio from '@/features/mantenimiento/PantallaDeInicio';
import PantallaDeEquipos from '@/features/mantenimiento/PantallaDeEquipos';
import PantallaDeOrdenes from '@/features/mantenimiento/PantallaDeOrdenes';
import { ContextoDeMantenimiento, type ServicioDeMantenimiento } from '@/features/mantenimiento/servicio';
import { usePedido } from '@/lib/usePedido';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';
import { useLogoParaPdf } from '~/lib/useLogoParaPdf';
import {
  type DatosDeMantenimiento, buscarEquipos, buscarRepuestosParaEquipos, crearSector, datosDeMantenimiento, duplicarEquipo, eliminarEquipo,
  eliminarGastoExterno, eliminarIntervencion, eliminarSector, fichaDeEquipo, guardarEquipo, guardarGastoExterno, guardarIntervencion, guardarRepuestoCritico, moverSector,
  paradasDeEquipos, quitarManual, quitarRepuestoCritico, renombrarSector,
} from './acciones';
import {
  type DatosDePreventivo, anotarValor, aprobarOt, asignarOt, cargarCorrectiva, cerrarOt, crearOtCorrectiva, datosDePreventivo, derivarOts, devolverOt, eliminarOt,
  eliminarPlanilla, eliminarRutina, empezarOt, guardarConfig, guardarFallaOt, guardarPlanilla, guardarRepuestosOt, guardarRutina, marcarTareas, ordenDeTrabajo,
  pasarAAprobacion, reprogramarOt, terminarOt,
} from './accionesPreventivo';
import { CONFIG_DE_FABRICA } from '@/features/mantenimiento/preventivo';
import type { RolMantenimiento } from '@/features/mantenimiento/tipos';

interface Props {
  pantalla: 'inicio' | 'equipos' | 'calendario' | 'ordenes';
  iniciales: DatosIniciales<DatosDeMantenimiento>;
  /** Las rutinas y las OT (en Calendario y Órdenes de trabajo). */
  preventivo?: DatosIniciales<DatosDePreventivo>;
  esAdmin: boolean;
  trabaja: boolean;
  rol: RolMantenimiento;
  jefe: boolean;
  usuarioId: string;
  empresa: { nombre: string; logo: string | null };
  /** Equipo (o OT, en Órdenes) a mostrar abierto al llegar. */
  abrir: string | null;
  /** En Equipos: el sector (o sub-sector) elegido en el menú. */
  sector?: string | null;
}

// Las pantallas de Mantenimiento del socio, con los datos y las acciones del servidor. Después de cada cambio se vuelven a leer.
export default function MantenimientoEnNext({ pantalla, iniciales, preventivo, esAdmin, trabaja, rol, jefe, usuarioId, empresa, abrir, sector = null }: Props) {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const datos = usePedido(`mantenimiento|${revision}`, datosDeMantenimiento, true, useInicial(iniciales));
  const inicialPreventivo = useInicial(preventivo ?? { data: { rutinas: [], ordenes: [] }, lote: 'sin-preventivo' });
  const prev = usePedido(preventivo ? `preventivo|${revision}` : null, datosDePreventivo, true, preventivo ? inicialPreventivo : undefined);
  const logo = useLogoParaPdf(empresa.logo);

  const servicio = useMemo<ServicioDeMantenimiento>(() => {
    const listo = () => setRevision(v => v + 1);
    // cada cambio: si la base dijo que no, el mensaje llega como error a la pantalla; si salió bien, se vuelve a leer todo
    const yLeer = async <T extends { error: string | null }>(r: Promise<T>): Promise<T> => {
      const res = await r;
      if (res.error) throw new Error(res.error);
      listo();
      return res;
    };
    const d = datos.data;
    return {
      equipos: d?.equipos,
      sectores: d?.sectores ?? [],
      tecnicos: d?.tecnicos ?? [],
      isError: !!datos.error || !!prev.error,
      esAdmin,
      trabaja,
      rol,
      jefe,
      revision,
      usuarioId,
      rutinas: prev.data?.rutinas,
      ordenes: prev.data?.ordenes,
      empresa: { nombre: empresa.nombre, logo },
      buscar: buscarEquipos,
      ficha: fichaDeEquipo,
      guardarEquipo: async e => (await yLeer(guardarEquipo(e))).id ?? '',
      eliminarEquipo: async id => { await yLeer(eliminarEquipo(id)); },
      duplicarEquipo: async x => (await yLeer(duplicarEquipo(x))).id ?? '',
      crearSector: async (nombre, padreId) => { await yLeer(crearSector(nombre, padreId)); },
      renombrarSector: async (id, nombre) => { await yLeer(renombrarSector(id, nombre)); },
      eliminarSector: async id => { await yLeer(eliminarSector(id)); },
      moverSector: async (id, delta) => { await yLeer(moverSector(id, delta)); },
      buscarRepuestos: buscarRepuestosParaEquipos,
      guardarRepuesto: async r => { await yLeer(guardarRepuestoCritico(r)); },
      quitarRepuesto: async (equipoId, itemId) => { await yLeer(quitarRepuestoCritico(equipoId, itemId)); },
      subirManual: async (equipoId, archivo, avance) => {
        // por su dirección propia y el archivo solo (no en un formulario): el servidor lo guarda a medida que llega (hasta 200 MB)
        if (archivo.size > 200 * 1024 * 1024) throw new Error(`"${archivo.name}" pesa más de 200 MB: no se puede subir.`);
        // (con XMLHttpRequest y no fetch: es lo único del navegador que avisa cuánto lleva subido, para la barra)
        const error = await new Promise<string | null>(listo => {
          const pedido = new XMLHttpRequest();
          pedido.open('POST', `/mantenimiento/manuales?${new URLSearchParams({ equipo: equipoId, nombre: archivo.name })}`);
          pedido.setRequestHeader('Content-Type', 'application/pdf');
          pedido.upload.onprogress = e => { if (e.lengthComputable) avance?.(Math.min(100, Math.round((e.loaded / e.total) * 100))); };
          pedido.upload.onload = () => avance?.('optimizando');
          pedido.onload = () => {
            let respuesta: { error?: string | null } = {};
            try { respuesta = JSON.parse(pedido.responseText) as { error?: string | null }; } catch { /* respuesta rara: abajo dice que no se pudo */ }
            listo(pedido.status >= 200 && pedido.status < 300 && respuesta.error === null ? null : respuesta.error ?? 'No se pudo subir el manual. Probá de nuevo.');
          };
          pedido.onerror = () => listo('No se pudo subir el manual (¿se cortó internet?). Probá de nuevo.');
          pedido.send(archivo);
        });
        if (error) throw new Error(error);
        listo();
      },
      quitarManual: async id => { await yLeer(quitarManual(id)); },
      guardarIntervencion: async i => { await yLeer(guardarIntervencion(i)); },
      eliminarIntervencion: async id => { await yLeer(eliminarIntervencion(id)); },
      orden: ordenDeTrabajo,
      guardarRutina: async r => { await yLeer(guardarRutina(r)); },
      eliminarRutina: async id => { await yLeer(eliminarRutina(id)); },
      crearCorrectiva: async o => (await yLeer(crearOtCorrectiva(o))).numero ?? 0,
      marcarTareas: async (otId, tareaId, hecha) => { await yLeer(marcarTareas(otId, tareaId, hecha)); },
      empezarOt: async id => { await yLeer(empezarOt(id)); },
      reprogramarOt: async (id, fecha) => { await yLeer(reprogramarOt(id, fecha)); },
      guardarRepuestosOt: async (id, repuestos) => { await yLeer(guardarRepuestosOt(id, repuestos)); },
      guardarFallaOt: async (id, prioridad, falla) => { await yLeer(guardarFallaOt(id, prioridad, falla)); },
      cerrarOt: async (id, c) => {
        const r = await yLeer(cerrarOt(id, c));
        return r.resultado ?? { siguiente: null, pendientes: null, valores: null, descontados: 0, faltantes: 0 };
      },
      eliminarOt: async id => { await yLeer(eliminarOt(id)); },
      planillas: d?.planillas ?? [],
      config: d?.config ?? CONFIG_DE_FABRICA,
      guardarPlanilla: async p => (await yLeer(guardarPlanilla(p))).rutinas ?? 0,
      eliminarPlanilla: async id => { await yLeer(eliminarPlanilla(id)); },
      guardarConfig: async c => { await yLeer(guardarConfig(c)); },
      anotarValor: async (otId, tareaId, valor) => { await yLeer(anotarValor(otId, tareaId, valor)); },
      paradas: paradasDeEquipos,
      guardarGasto: async g => { await yLeer(guardarGastoExterno(g)); },
      eliminarGasto: async id => { await yLeer(eliminarGastoExterno(id)); },
      terminarOt: async (id, c) => (await yLeer(terminarOt(id, c))).siguiente ?? null,
      cargarCorrectiva: async c => (await yLeer(cargarCorrectiva(c))).numero ?? 0,
      derivarOts: async ids => (await yLeer(derivarOts(ids))).cuantas ?? 0,
      asignarOt: async (id, usuarios) => { await yLeer(asignarOt(id, usuarios)); },
      pasarAAprobacion: async (id, comentario) => { await yLeer(pasarAAprobacion(id, comentario)); },
      devolverOt: async (id, comentario) => { await yLeer(devolverOt(id, comentario)); },
      aprobarOt: async (id, op) => (await yLeer(aprobarOt(id, op))).resultado ?? { pendientes: null, aMano: null, valores: null, descontados: 0, faltantes: 0 },
    };
  }, [datos.data, datos.error, prev.data, prev.error, esAdmin, trabaja, rol, jefe, revision, usuarioId, empresa.nombre, logo]);

  const verEquipo = (id: string) => router.push(`/mantenimiento/equipos?equipo=${id}`);
  return (
    <ContextoDeMantenimiento.Provider value={servicio}>
      {pantalla === 'inicio' && <PantallaDeInicio onVerEquipo={verEquipo} />}
      {pantalla === 'equipos' && (
        <PantallaDeEquipos key={sector ?? 'todos'} abrir={abrir} fijo={sector ? { sectorId: sector } : null}
          alVolver={() => (window.history.length > 1 ? router.back() : router.push('/mantenimiento/equipos'))} />
      )}
      {pantalla === 'calendario' && <PantallaDeCalendario onVerEquipo={verEquipo} />}
      {pantalla === 'ordenes' && <PantallaDeOrdenes onVerEquipo={verEquipo} abrir={abrir} />}
    </ContextoDeMantenimiento.Provider>
  );
}
