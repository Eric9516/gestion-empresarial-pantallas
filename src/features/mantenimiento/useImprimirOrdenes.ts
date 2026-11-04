import { useCallback } from 'react';
import { useToast } from '../../components/ToastProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { abrirPdfBlob } from '../../lib/pdfBlob';
import { useConfiguracionQuery } from '../config/useConfiguracion';
import { generarOtPdf, generarPlanillaPdf } from './otPdf';
import { useEquiposQuery } from './useEquipos';
import { useConfigMantenimiento, useRutinasQuery } from './usePreventivo';
import type { OrdenTrabajo, PlanillaTareas } from './tipos';

/** Devuelve una función que arma el PDF de una o varias OT (una por hoja) y lo abre para imprimir. */
export function useImprimirOrdenes() {
  const toast = useToast();
  const { data: config } = useConfiguracionQuery();
  const { data: equipos } = useEquiposQuery();
  const { data: rutinas } = useRutinasQuery();
  const formato = useConfigMantenimiento();

  return useCallback(async (ordenes: OrdenTrabajo[]) => {
    if (!ordenes.length) return;
    try {
      const blob = await generarOtPdf(ordenes.map(ot => ({
        empresa: config?.empresa_nombre || 'Mi Empresa',
        logo: config?.logo_base64 ?? '',
        ot,
        equipo: equipos.find(e => e.id === ot.equipoId),
        padre: equipos.find(e => e.id === equipos.find(x => x.id === ot.equipoId)?.padreId),
        rutina: rutinas.find(r => r.id === ot.rutinaId),
        config: formato,
      })));
      abrirPdfBlob(blob);
    } catch (err) {
      await registrarErrorAccion('Error al generar el PDF de una OT', err);
      toast('No se pudo generar el PDF de la OT', 'error');
    }
  }, [config, equipos, rutinas, toast, formato]);
}

/** Devuelve una función que arma el PDF de una planilla de tareas en blanco (para imprimir y llevar al equipo). */
export function useImprimirPlanilla() {
  const toast = useToast();
  const { data: config } = useConfiguracionQuery();
  const formato = useConfigMantenimiento();
  return useCallback(async (planilla: PlanillaTareas) => {
    try {
      const blob = await generarPlanillaPdf([{ empresa: config?.empresa_nombre || 'Mi Empresa', logo: config?.logo_base64 ?? '', planilla, config: formato }]);
      abrirPdfBlob(blob);
    } catch (err) {
      await registrarErrorAccion('Error al generar el PDF de una planilla de tareas', err);
      toast('No se pudo generar el PDF de la planilla', 'error');
    }
  }, [config, toast, formato]);
}
