import { useState } from 'react';
import Modal from '../../components/Modal';
import ColorMarca from '../../components/ColorMarca';
import { Icono } from '@/components/Icono';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COLOR_DEPOSITO_ORIGINAL, textoLegibleConBlanco } from '../../lib/marca';
import { ICONOS_DEPOSITO, iconoDeDeposito } from './iconos';
import type { Deposito } from './useDepositos';

export interface ValoresDeposito { nombre: string; prefijo: string; color: string | null; icono: string; activo: boolean }

interface Props {
  /** El depósito que se edita; sin él, se crea uno nuevo. */
  deposito?: Deposito;
  guardando: boolean;
  onGuardar: (v: ValoresDeposito) => void;
  onClose: () => void;
}

// Crear o editar un depósito: nombre, letra de los códigos, color, ícono y (al editar) si está activo.
export default function DepositoFormModal({ deposito, guardando, onGuardar, onClose }: Props) {
  const [nombre, setNombre] = useState(deposito?.nombre ?? '');
  const [prefijo, setPrefijo] = useState(deposito?.prefijo ?? '');
  const [color, setColor] = useState(deposito?.color ?? '');
  const [icono, setIcono] = useState(iconoDeDeposito(deposito?.icono) as string);
  const [activo, setActivo] = useState(deposito?.activo ?? true);

  const colorOk = textoLegibleConBlanco(color || COLOR_DEPOSITO_ORIGINAL);
  const valido = nombre.trim().length > 0 && /^[A-Za-z]$/.test(prefijo) && colorOk;

  return (
    <Modal
      open
      onClose={onClose}
      title={<><Icono n={iconoDeDeposito(icono)} /> {deposito ? 'Editar depósito' : 'Nuevo depósito'}</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="success"
            disabled={!valido || guardando}
            onClick={() => onGuardar({ nombre: nombre.trim(), prefijo: prefijo.toUpperCase(), color: color || null, icono, activo })}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="form-group">
        <label htmlFor="deposito-nombre">Nombre</label>
        <Input id="deposito-nombre" data-autofocus maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Mantenimiento, Insumos" />
      </div>
      <div className="form-group">
        <label htmlFor="deposito-letra">Letra de los códigos</label>
        <Input id="deposito-letra" maxLength={1} value={prefijo} onChange={e => setPrefijo(e.target.value.toUpperCase())} style={{ width: 70, textAlign: 'center', fontWeight: 800 }} placeholder="M" />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          Los repuestos de este depósito empiezan con esta letra. Se puede cambiar solo mientras el depósito no tenga repuestos.
        </p>
      </div>
      <div className="form-group">
        <label>Color del encabezado</label>
        <ColorMarca etiqueta="Color" valor={color} original={COLOR_DEPOSITO_ORIGINAL} onChange={setColor} />
      </div>
      <div className="form-group">
        <label id="deposito-icono-etiqueta">Ícono</label>
        <div role="group" aria-labelledby="deposito-icono-etiqueta" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ICONOS_DEPOSITO.map(n => (
            <button
              key={n}
              type="button"
              aria-label={n}
              aria-pressed={icono === n}
              onClick={() => setIcono(n)}
              style={{
                width: 42, height: 42, display: 'grid', placeItems: 'center', fontSize: 20, borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${icono === n ? 'var(--deposito, var(--primary))' : 'var(--border)'}`,
                background: icono === n ? 'var(--bg)' : 'var(--white)', color: 'var(--text)',
              }}
            >
              <Icono n={n} />
            </button>
          ))}
        </div>
      </div>
      {deposito && !deposito.es_principal && (
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} /> Activo
          </label>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Un depósito desactivado deja de aparecer, pero conserva su historial. Nunca se borra.</p>
        </div>
      )}
    </Modal>
  );
}
