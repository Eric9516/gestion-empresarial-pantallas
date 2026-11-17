import { useState } from 'react';
import { useConfirm } from '../../components/ConfirmProvider';
import { isOwner } from '../../lib/types';
import { Icono } from '@/components/Icono';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { useToast } from '../../components/ToastProvider';
import { COLOR_DEPOSITO_ORIGINAL } from '../../lib/marca';
import DepositoFormModal, { type ValoresDeposito } from './DepositoFormModal';
import { comoTrabaja } from './comoTrabaja';
import { iconoDeDeposito } from './iconos';
import { usePedido } from '../../lib/usePedido';
import { useServicioDeConfiguracion } from '../admin/servicioDeConfiguracion';
import type { Deposito } from './tipos';

// Configuración → Depósito → Depósitos (solo el dueño): los depósitos de la empresa, con su nombre, color e ícono.
export default function DepositosPane() {
  const { depositos: servicio, perfil } = useServicioDeConfiguracion();
  const confirmar = useConfirm();
  const dueno = isOwner(perfil);

  // borrar: solo un dueño y solo un depósito sin historia (si tiene, se desactiva)
  async function borrar(d: Deposito) {
    if (!servicio.borrar) return;
    if (!(await confirmar(`¿Borrar el depósito "${d.nombre}"? Se borran también sus familias y los permisos que alguien tenga en él. No se puede deshacer.`, { textoConfirmar: 'Borrar', peligroso: true }))) return;
    try {
      await servicio.borrar(d.id);
      toast('Depósito borrado', 'success');
      lista.recargar?.();
    } catch (e) {
      toast(mensajeDeError(e), 'error');
    }
  }
  const lista = usePedido('depositos', servicio.leer, true);
  const pedidoTope = usePedido('tope', servicio.tope);
  const isLoading = lista.data === undefined && !lista.error;
  const errorDepositos = !!lista.error;
  const tope = pedidoTope.data ?? 1;
  const errorTope = !!pedidoTope.error;
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();
  // undefined = cerrado, null = uno nuevo, un depósito = editándolo
  const [abierto, setAbierto] = useState<Deposito | null | undefined>(undefined);

  const todos = lista.data ?? [];
  const enUso = todos.filter(d => d.activo).length;
  const lleno = enUso >= tope;
  // Si la base de datos de esta empresa todavía no tiene los depósitos editables, se avisa en vez de mostrar una lista vacía que parece rota.
  const baseSinActualizar = errorDepositos || errorTope;

  async function guardar(v: ValoresDeposito) {
    setGuardando(true);
    try {
      if (abierto) {
        await servicio.editar({ ...v, id: abierto.id, activo: abierto.es_principal ? true : v.activo });
        toast('Depósito guardado', 'success');
      } else {
        const { activo: _activo, ...nuevo } = v;
        await servicio.crear(nuevo);
        toast('Depósito creado', 'success');
      }
      setAbierto(undefined);
      lista.recargar();
    } catch (e) {
      toast(mensajeDeError(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="admin-card" style={{ maxWidth: 640 }}>
      <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span><Icono n="deposito" /> Depósitos</span>
        {!baseSinActualizar && <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>{enUso} de {tope} en uso</span>}
      </div>
      <div className="admin-card-body">
        {baseSinActualizar && (
          <p role="alert" style={{ padding: 12, borderRadius: 10, background: 'var(--warning-bg, #fff6e0)', color: 'var(--text)', fontSize: 13 }}>
            <Icono n="alerta" /> A la base de datos de esta empresa todavía le falta la actualización de los depósitos. Hasta que se aplique, no se pueden editar desde acá. Pedile a quien administra el sistema que la actualice (<code>pnpm cliente actualizar</code>).
          </p>
        )}
        {!baseSinActualizar && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>Tocá <strong>Editar</strong> para cambiarle el nombre, el color o el ícono a un depósito, también al original, y para elegir cómo trabaja: si los operarios retiran artículos y si manda cosas a reparar.</p>}
        {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {todos.map(d => (
            <li
              key={d.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, opacity: d.activo ? 1 : 0.6 }}
            >
              <span
                aria-hidden
                style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 20, color: '#fff', background: d.color ?? COLOR_DEPOSITO_ORIGINAL }}
              >
                <Icono n={iconoDeDeposito(d.icono)} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nombre}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Letra {d.prefijo}{d.es_principal ? ' · Principal' : ''}{d.activo ? '' : ' · Desactivado'} · {comoTrabaja(d)}
                </span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(d)} aria-label={`Editar ${d.nombre}`}><Icono n="editar" /> Editar</Button>
              {dueno && !d.es_principal && servicio.borrar && (d.motivo_no_borrar
                ? <span title={d.motivo_no_borrar} style={{ fontSize: 12, color: 'var(--text-mid)', maxWidth: 160 }}>No se puede borrar: tiene historial</span>
                : <Button type="button" variant="dangerGhost" size="sm" onClick={() => void borrar(d)} aria-label={`Borrar ${d.nombre}`}><Icono n="borrar" /> Borrar</Button>)}
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 14 }}>
          <Button variant="primary" size="sm" disabled={lleno || baseSinActualizar} onClick={() => setAbierto(null)}><Icono n="mas" /> Nuevo depósito</Button>
          {lleno && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              El plan permite hasta {tope} depósito{tope === 1 ? '' : 's'}. Para tener más, pedí ampliar el plan.
            </p>
          )}
        </div>
      </div>
      {abierto !== undefined && (
        <DepositoFormModal
          key={abierto?.id ?? 'nuevo'}
          deposito={abierto ?? undefined}
          guardando={guardando}
          onGuardar={v => void guardar(v)}
          onClose={() => setAbierto(undefined)}
        />
      )}
    </div>
  );
}
