import { formatearFechaSola } from '../../lib/fechaHoy';
import type { EstadoAviso } from './preventivo';
import { useFaltantes } from './useStockRepuestos';
import type { OrdenTrabajo } from './tipos';
import { Icono } from '@/components/Icono';

const TEXTO: Record<EstadoAviso, string> = {
  vencida: 'Vencida',
  por_vencer: 'Por vencer',
  programada: 'Programada',
  terminada: 'Terminada',
};

/** Chips con el estado de una OT (vencida, por vencer, programada, terminada), si está en curso, si es urgente y si falta algún repuesto. */
export default function EstadoOT({ ot, estado, conFecha }: { ot: OrdenTrabajo; estado: EstadoAviso; conFecha?: boolean }) {
  const faltantes = useFaltantes();
  const falta = ot.estado !== 'terminada' && faltantes(ot.repuestos ?? []).length > 0;
  return (
    <>
      <span className={`mt-tag ${estado}`}>
        {TEXTO[estado]}{conFecha && estado !== 'terminada' && <> · {formatearFechaSola(ot.fechaProgramada)}</>}
      </span>
      {ot.estado === 'en_curso' && <span className="mt-tag programada">En curso</span>}
      {ot.correctivo?.prioridad === 'urgente' && ot.estado !== 'terminada' && <span className="mt-tag urgente">Urgente</span>}
      {falta && <span className="mt-tag falta"><Icono n="alerta" /> Falta repuesto</span>}
    </>
  );
}
