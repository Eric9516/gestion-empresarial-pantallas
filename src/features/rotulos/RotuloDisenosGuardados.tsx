import { useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import {
  useEliminarModeloRotulo, useRotuloDisenosQuery, useUsarModeloRotulo, type RotuloDiseno,
} from './useRotuloDiseno';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

interface Props {
  disenoActivoId: number | null;
  // El padre es dueño del estado de diseño "en edición" (colores, campos, pie
  // todavía no guardados) — este componente solo pide el nombre y le avisa.
  onGuardarComoModelo: (nombre: string) => Promise<void>;
}

export default function RotuloDisenosGuardados({ disenoActivoId, onGuardarComoModelo }: Props) {
  const { data: modelos } = useRotuloDisenosQuery();
  const usarModelo = useUsarModeloRotulo();
  const eliminarModelo = useEliminarModeloRotulo();
  const toast = useToast();
  const confirmar = useConfirm();
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function handleGuardar() {
    if (!nombre.trim()) { toast('Ponele un nombre al modelo', 'error'); return; }
    setGuardando(true);
    try {
      await onGuardarComoModelo(nombre.trim());
      setNombre('');
      toast('Modelo guardado', 'success');
    } catch {
      toast('Error al guardar el modelo', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function handleUsar(modelo: RotuloDiseno) {
    try {
      await usarModelo.mutateAsync(modelo);
      toast(`"${modelo.nombre}" ahora es el predeterminado`, 'success');
    } catch {
      toast('Error al aplicar el modelo', 'error');
    }
  }

  async function handleEliminar(modelo: RotuloDiseno) {
    if (!(await confirmar(`¿Eliminar el modelo "${modelo.nombre}"? Esta acción no se puede deshacer.`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await eliminarModelo.mutateAsync(modelo.id);
      toast('Modelo eliminado', 'error');
    } catch {
      toast('Error al eliminar el modelo', 'error');
    }
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1.5px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--blue)', marginBottom: 10 }}><Icono n="guardar" /> Modelos guardados</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Input type="text" placeholder="Nombre del modelo" value={nombre} onChange={e => setNombre(e.target.value)} style={{ flex: '1 1 180px', minWidth: 0 }} />
        <Button variant="primary" size="sm" onClick={() => void handleGuardar()} disabled={guardando}>+ Guardar como modelo</Button>
      </div>
      {!modelos?.length && <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>No hay modelos guardados todavía.</div>}
      {modelos?.map(m => {
        const activo = m.id === disenoActivoId;
        return (
          <div key={m.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', border: `1.5px solid ${activo ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 8, marginBottom: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                {m.nombre} {activo && <span className="badge badge-active">Predeterminado</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Guardado el {new Date(m.created_at).toLocaleDateString('es-AR')}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {!activo && <Button variant="ghost" size="sm" onClick={() => void handleUsar(m)}>Usar como predeterminado</Button>}
              <Button variant="dangerGhost" size="sm" onClick={() => void handleEliminar(m)}>Eliminar</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
