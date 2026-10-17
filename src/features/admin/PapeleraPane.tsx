import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { usePapeleraQuery, useRestaurarDePapelera, usePurgarDePapelera, type FilaPapelera } from './usePapelera';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';
import type { ReactNode } from 'react';

const ETIQUETA_TIPO: Record<FilaPapelera['tipo'], ReactNode> = {
  proveedor: <><Icono n="fabrica" /> Proveedor</>,
  repuesto: <><Icono n="herramienta" /> Repuesto</>,
  reparacion: <><Icono n="herramienta" /> Reparación</>,
  envio: <><Icono n="paquete" /> Envío</>,
};

export default function PapeleraPane() {
  const { data: filas, isLoading, isError } = usePapeleraQuery();
  const restaurar = useRestaurarDePapelera();
  const purgar = usePurgarDePapelera();
  const toast = useToast();
  const confirmar = useConfirm();

  async function handleRestaurar(tipo: FilaPapelera['tipo'], id: string) {
    try {
      await restaurar.mutateAsync({ tipo, id });
      toast('Restaurado', 'success');
    } catch (e) {
      await registrarErrorAccion('Error al restaurar desde la Papelera', e);
      toast('Error al restaurar: ' + mensajeDeError(e), 'error');
    }
  }

  async function handlePurgar(tipo: FilaPapelera['tipo'], id: string) {
    if (!(await confirmar('¿Eliminar esto DEFINITIVAMENTE? No se puede deshacer.', { textoConfirmar: 'Eliminar definitivamente', peligroso: true }))) return;
    try {
      await purgar.mutateAsync({ tipo, id });
      toast('Eliminado definitivamente', 'success');
    } catch (e) {
      await registrarErrorAccion('Error al purgar desde la Papelera', e);
      toast('Error al eliminar: ' + mensajeDeError(e), 'error');
    }
  }

  if (isLoading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>;
  if (isError) return <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error al cargar la papelera.</p>;

  if (!filas?.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Icono n="borrar" /></div>
        <h2>La papelera está vacía</h2>
        <p>Lo que se elimine de Proveedores, Repuestos, Reparaciones o Envíos va a aparecer acá.</p>
      </div>
    );
  }

  return (
    <div>
      {filas.map(f => (
        <div className="admin-card" style={{ marginBottom: 10 }} key={`${f.tipo}-${f.id}`}>
          <div className="admin-card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <span className="badge badge-rubro">{ETIQUETA_TIPO[f.tipo]}</span>
              <div style={{ fontWeight: 700, marginTop: 6 }}>{f.titulo}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Eliminado por {f.quien} — {f.eliminado_at ? new Date(f.eliminado_at).toLocaleString('es-AR') : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => void handleRestaurar(f.tipo, f.id)}><Icono n="devolver" /> Restaurar</Button>
              <Button variant="dangerGhost" size="sm" onClick={() => void handlePurgar(f.tipo, f.id)}>Eliminar definitivamente</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
