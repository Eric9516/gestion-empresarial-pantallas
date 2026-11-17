import { useState } from 'react';
import Modal from '../../components/Modal';
import ColorMarca from '../../components/ColorMarca';
import { Icono } from '@/components/Icono';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { avisoDelCampo } from '@/components/ui/campo';
import { irAlCampo } from '../../lib/irAlCampo';
import { COLOR_DEPOSITO_ORIGINAL, textoLegibleConBlanco } from '../../lib/marca';
import { ICONOS_DEPOSITO, iconoDeDeposito } from './iconos';
import type { Deposito } from './tipos';

export interface ValoresDeposito { nombre: string; prefijo: string; color: string | null; icono: string; activo: boolean; usa_retiros: boolean; usa_reparaciones: boolean }

interface Props {
  /** El depósito que se edita; sin él, se crea uno nuevo. */
  deposito?: Deposito;
  guardando: boolean;
  onGuardar: (v: ValoresDeposito) => void;
  onClose: () => void;
}

// Crear o editar un depósito: nombre, letra de los códigos, color, ícono, cómo trabaja y (al editar) si está activo.
// Lo abre quien decide cómo trabajan los depósitos: el dueño o el administrador de Compras.
export default function DepositoFormModal({ deposito, guardando, onGuardar, onClose }: Props) {
  const [nombre, setNombre] = useState(deposito?.nombre ?? '');
  const [prefijo, setPrefijo] = useState(deposito?.prefijo ?? '');
  const [color, setColor] = useState(deposito?.color ?? '');
  const [icono, setIcono] = useState(iconoDeDeposito(deposito?.icono) as string);
  const [activo, setActivo] = useState(deposito?.activo ?? true);
  // uno nuevo arranca sin nada además de lo básico: se elige acá, a la vista
  const [usaRetiros, setUsaRetiros] = useState(deposito?.usa_retiros ?? false);
  const [usaReparaciones, setUsaReparaciones] = useState(deposito?.usa_reparaciones ?? false);

  const colorOk = textoLegibleConBlanco(color || COLOR_DEPOSITO_ORIGINAL);
  const faltaNombre = !nombre.trim();
  const faltaLetra = !/^[A-Za-z]$/.test(prefijo);
  // Se tocó Guardar con algo sin completar: desde ahí se marca en rojo lo que falta
  const [revisar, setRevisar] = useState(false);

  function guardar() {
    if (faltaNombre || faltaLetra || !colorOk) {
      setRevisar(true);
      // el color muy claro ya lo explica su propio aviso, al lado del color
      irAlCampo(faltaNombre ? 'deposito-nombre' : faltaLetra ? 'deposito-letra' : null);
      return;
    }
    onGuardar({ nombre: nombre.trim(), prefijo: prefijo.toUpperCase(), color: color || null, icono, activo, usa_retiros: usaRetiros, usa_reparaciones: usaReparaciones });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={<><Icono n={iconoDeDeposito(icono)} /> {deposito ? 'Editar depósito' : 'Nuevo depósito'}</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="success" disabled={guardando} onClick={guardar}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="form-group">
        <label htmlFor="deposito-nombre">Nombre</label>
        <Input id="deposito-nombre" data-autofocus maxLength={120} value={nombre} aria-invalid={revisar && faltaNombre} onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Mantenimiento, Insumos" />
        {revisar && faltaNombre && <p className={avisoDelCampo}>Poné el nombre del depósito.</p>}
      </div>
      <div className="form-group">
        <label htmlFor="deposito-letra">Letra de los códigos</label>
        <Input id="deposito-letra" maxLength={1} value={prefijo} aria-invalid={revisar && faltaLetra} onChange={e => setPrefijo(e.target.value.toUpperCase())}
          style={{ width: 70, textAlign: 'center', fontWeight: 800 }} placeholder="M" />
        {revisar && faltaLetra && <p className={avisoDelCampo}>Poné una letra (de la A a la Z).</p>}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          Los artículos de este depósito empiezan con esta letra. Se puede cambiar solo mientras el depósito no tenga artículos.
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
      <fieldset className="form-group" style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
        <legend style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Cómo trabaja</legend>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
          Todos los depósitos buscan artículos, reciben mercadería y ajustan stock. Además, este depósito:
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontWeight: 400, marginBottom: 8 }}>
          <input type="checkbox" checked={usaRetiros} onChange={e => setUsaRetiros(e.target.checked)} style={{ marginTop: 3 }} />
          <span><strong>Los operarios retiran artículos</strong><br />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cada uno busca lo que necesita y lo retira ("A retirar" y "Retiros"). Si no, lo que sale se da de baja con un ajuste.</span></span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
          <input type="checkbox" checked={usaReparaciones} onChange={e => setUsaReparaciones(e.target.checked)} style={{ marginTop: 3 }} />
          <span><strong>Manda cosas a reparar</strong><br />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lleva la cuenta de lo que se envía a un proveedor y de lo que vuelve.</span></span>
        </label>
        {deposito && ((deposito.usa_retiros && !usaRetiros) || (deposito.usa_reparaciones && !usaReparaciones)) && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Apagarlo no borra nada: lo que ya existe se sigue viendo y se puede terminar. Solo deja de poder empezarse algo nuevo.
          </p>
        )}
      </fieldset>
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
