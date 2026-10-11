import { useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { useProveedoresQuery, type Proveedor } from '../proveedores/useProveedores';
import { useAgregarProveedorAItem, useProveedoresDeItemQuery, useQuitarProveedorDeItem } from './useItemProveedores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

const MAX_SUGERENCIAS = 6;

function AgregarProveedor({ itemId, yaVinculados, onListo }: { itemId: string; yaVinculados: Set<string>; onListo: () => void }) {
  const toast = useToast();
  const { data: proveedores, isLoading } = useProveedoresQuery();
  const agregar = useAgregarProveedorAItem(itemId);
  const [busqueda, setBusqueda] = useState('');

  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (proveedores ?? [])
      .filter(p => !yaVinculados.has(p.id) && (!q || p.nombre.toLowerCase().includes(q)))
      .slice(0, MAX_SUGERENCIAS);
  }, [proveedores, busqueda, yaVinculados]);

  async function handleElegir(proveedorId: string) {
    try {
      await agregar.mutateAsync(proveedorId);
      toast('Proveedor agregado', 'success');
      onListo();
    } catch (e) {
      await registrarErrorAccion('Error al agregar proveedor a un repuesto', e);
      toast('Error al agregar el proveedor', 'error');
    }
  }

  return (
    <div style={{ marginTop: 8, border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: 8, background: 'var(--surface2)' }}>
      <Input
        data-autofocus
        placeholder="Buscar proveedor por nombre..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />
      {isLoading && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Cargando...</div>}
      {!isLoading && sugerencias.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>No hay proveedores para agregar.</div>
      )}
      {sugerencias.map(p => (
        <Button
          key={p.id}
          type="button"
          variant="ghost" size="sm"
          style={{ width: '100%', justifyContent: 'flex-start', marginTop: 4 }}
          disabled={agregar.isPending}
          onClick={() => void handleElegir(p.id)}
        >
          {p.nombre}{p.rubro ? <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>· {p.rubro}</span> : null}
        </Button>
      ))}
      <div style={{ marginTop: 6, textAlign: 'right' }}>
        <Button type="button" variant="ghost" size="sm" onClick={onListo}>Cancelar</Button>
      </div>
    </div>
  );
}

// Solo se muestra a admins de Mantenimiento (el componente que lo usa ya lo
// filtra, y la tabla item_proveedores tiene RLS con is_mantenimiento_admin()).
export default function ProveedoresDeItem({ itemId, onVerProveedor }: { itemId: string; onVerProveedor: (proveedor: Proveedor) => void }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { data: vinculos, isLoading, isError } = useProveedoresDeItemQuery(itemId, true);
  const { data: proveedores } = useProveedoresQuery();
  const quitar = useQuitarProveedorDeItem(itemId);
  const [agregando, setAgregando] = useState(false);

  const yaVinculados = useMemo(() => new Set((vinculos ?? []).map(v => v.proveedor.id)), [vinculos]);

  async function handleQuitar(vinculoId: string, nombre: string) {
    if (!(await confirmar(`¿Quitar a "${nombre}" de este repuesto?`, { textoConfirmar: 'Quitar' }))) return;
    try {
      await quitar.mutateAsync(vinculoId);
      toast('Proveedor quitado', 'success');
    } catch (e) {
      await registrarErrorAccion('Error al quitar proveedor de un repuesto', e);
      toast('Error al quitar el proveedor', 'error');
    }
  }

  return (
    <div className="detail-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>Proveedores</span>
        {!agregando && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAgregando(true)}><Icono n="mas" /> Agregar</Button>
        )}
      </div>
      {isLoading && <p style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ marginTop: 4, fontSize: 13, color: 'var(--danger)' }}>Error al cargar los proveedores.</p>}
      {!isLoading && !isError && vinculos?.length === 0 && !agregando && (
        <p style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Sin proveedores cargados.</p>
      )}
      {vinculos?.map(v => (
        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            title="Ver proveedor"
            onClick={() => { const completo = proveedores?.find(p => p.id === v.proveedor.id); if (completo) onVerProveedor(completo); }}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue)' }}>{v.proveedor.nombre}</div>
            {v.proveedor.rubro && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.proveedor.rubro}</div>}
          </button>
          <button
            type="button"
            aria-label={`Quitar ${v.proveedor.nombre}`}
            onClick={() => void handleQuitar(v.id, v.proveedor.nombre)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4 }}
          ><Icono n="cerrar" /></button>
        </div>
      ))}
      {agregando && <AgregarProveedor itemId={itemId} yaVinculados={yaVinculados} onListo={() => setAgregando(false)} />}
    </div>
  );
}
