import { useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { usePedido } from '../../lib/usePedido';
import type { Proveedor } from '../proveedores/tipos';
import type { ProveedorDeItem } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

const MAX_SUGERENCIAS = 6;

/** Lo que lee y hace la sección (cada app pone lo suyo: Supabase o el servidor). */
export interface AccionesDeProveedoresDelRepuesto {
  /** Los proveedores del repuesto (los que están en la Papelera no se listan). */
  leer: (itemId: string) => Promise<ProveedorDeItem[]>;
  /** Todos los proveedores (para elegir uno y para ver su ficha). */
  proveedores: () => Promise<Proveedor[]>;
  agregar: (itemId: string, proveedorId: string) => Promise<void>;
  /** Saca el vínculo (no toca al proveedor). */
  quitar: (vinculoId: string) => Promise<void>;
  registrarError: (descripcion: string, err: unknown) => Promise<void>;
}

interface PropsDeAgregar {
  itemId: string;
  proveedores: Proveedor[] | undefined;
  yaVinculados: Set<string>;
  acciones: AccionesDeProveedoresDelRepuesto;
  onListo: (agregado: boolean) => void;
}

function AgregarProveedor({ itemId, proveedores, yaVinculados, acciones, onListo }: PropsDeAgregar) {
  const toast = useToast();
  const isLoading = proveedores === undefined;
  const [agregando, setAgregando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (proveedores ?? [])
      .filter(p => !yaVinculados.has(p.id) && (!q || p.nombre.toLowerCase().includes(q)))
      .slice(0, MAX_SUGERENCIAS);
  }, [proveedores, busqueda, yaVinculados]);

  async function handleElegir(proveedorId: string) {
    setAgregando(true);
    try {
      await acciones.agregar(itemId, proveedorId);
      toast('Proveedor agregado', 'success');
      onListo(true);
    } catch (e) {
      await acciones.registrarError('Error al agregar proveedor a un artículo', e);
      toast('Error al agregar el proveedor', 'error');
    } finally {
      setAgregando(false);
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
          disabled={agregando}
          onClick={() => void handleElegir(p.id)}
        >
          {p.nombre}{p.rubro ? <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>· {p.rubro}</span> : null}
        </Button>
      ))}
      <div style={{ marginTop: 6, textAlign: 'right' }}>
        <Button type="button" variant="ghost" size="sm" onClick={() => onListo(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

interface Props {
  itemId: string;
  onVerProveedor: (proveedor: Proveedor) => void;
  acciones: AccionesDeProveedoresDelRepuesto;
}

// Los proveedores de un repuesto, en su detalle. Solo se muestra a quien administra el Depósito (el detalle ya lo filtra, y la tabla
// item_proveedores tiene RLS con is_mantenimiento_admin()). La comparten la app de Vite y la de Next.
export default function ProveedoresDelRepuesto({ itemId, onVerProveedor, acciones }: Props) {
  const toast = useToast();
  const confirmar = useConfirm();
  const pedido = usePedido(itemId, () => acciones.leer(itemId));
  const vinculos = pedido.data;
  const isLoading = pedido.cargando && !vinculos;
  const isError = !!pedido.error;
  const { data: proveedores } = usePedido('proveedores', acciones.proveedores);
  const [agregando, setAgregando] = useState(false);

  const yaVinculados = useMemo(() => new Set((vinculos ?? []).map(v => v.proveedor.id)), [vinculos]);

  async function handleQuitar(vinculoId: string, nombre: string) {
    if (!(await confirmar(`¿Quitar a "${nombre}" de este artículo?`, { textoConfirmar: 'Quitar' }))) return;
    try {
      await acciones.quitar(vinculoId);
      pedido.recargar();
      toast('Proveedor quitado', 'success');
    } catch (e) {
      await acciones.registrarError('Error al quitar proveedor de un artículo', e);
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
      {agregando && (
        <AgregarProveedor itemId={itemId} proveedores={proveedores} yaVinculados={yaVinculados} acciones={acciones}
          onListo={agregado => { setAgregando(false); if (agregado) pedido.recargar(); }} />
      )}
    </div>
  );
}
