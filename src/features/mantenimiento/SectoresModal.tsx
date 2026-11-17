import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { mensajeDeError } from '../../lib/errores';
import { normalizar } from './buscador';
import { sectoresConCantidad } from './sectores';
import { useMantenimiento } from './servicio';
import type { SectorConCantidad } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

// Sectores y sub-sectores de Mantenimiento (del diseño del socio): crear, renombrar (se ve en todos sus equipos), juntar y borrar, y ordenar
// los sectores por importancia. Dos niveles fijos (Sector → Sub-sector). Son aparte de los sectores del Depósito.

/** Qué se está editando: un sector o un sub-sector (por su id). */
type Edicion = string | null;

export default function SectoresModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useMantenimiento();
  const sectores = useMemo(() => sectoresConCantidad(s.sectores, s.equipos ?? []), [s.sectores, s.equipos]);
  const toast = useToast();
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState<Edicion>(null);
  const [agregandoSub, setAgregandoSub] = useState<string | null>(null);

  async function hacer(accion: () => Promise<void>, exito?: string) {
    try {
      await accion();
      if (exito) toast(exito, 'success');
      return true;
    } catch (err) {
      toast(mensajeDeError(err), 'error');
      return false;
    }
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (await hacer(() => s.crearSector(nuevo.trim(), null), `Sector "${nuevo.trim()}" creado`)) setNuevo('');
  }

  return (
    <Modal open={open} onClose={() => { setEditando(null); setAgregandoSub(null); onClose(); }} large title={<><Icono n="lugar" /> Sectores</>}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 0 }}>
        Cada sector puede tener sub-sectores (ej.: Servicios → Aire comprimido, Frío, Vapor). Si cambiás un nombre, se cambia en todos
        sus equipos; si le ponés el nombre de otro que ya existe, se juntan. Con las flechas ordenás los sectores por importancia:
        así aparecen en los filtros.
      </p>
      <form onSubmit={agregar} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="Nombre del sector nuevo" aria-label="Nombre del sector nuevo" data-autofocus maxLength={80} />
        <Button type="submit" variant="primary" disabled={!nuevo.trim()}><Icono n="mas" /> Agregar sector</Button>
      </form>
      {!sectores.length && <div className="mt-vacio">Todavía no hay sectores.</div>}
      {sectores.map((x, i) => (
        <div key={x.id} className="mt-sector">
          <FilaNombre
            id={x.id}
            nombre={x.nombre}
            detalle={x.equipos ? `${x.equipos} equipo${x.equipos === 1 ? '' : 's'}` : 'Sin equipos todavía'}
            editando={editando === x.id}
            onEditar={() => setEditando(x.id)}
            onCerrar={() => setEditando(null)}
            sector={x}
            hermanos={sectores.map(y => y.nombre)}
            principal
            numero={i + 1}
            hacer={hacer}
            extra={<>
              <span className="mt-orden">
                <Button variant="ghost" size="icon" title="Subir (más importante)" aria-label={`Subir ${x.nombre}`} disabled={i === 0} onClick={() => void hacer(() => s.moverSector(x.id, -1))}><Icono n="arriba" /></Button>
                <Button variant="ghost" size="icon" title="Bajar" aria-label={`Bajar ${x.nombre}`} disabled={i === sectores.length - 1} onClick={() => void hacer(() => s.moverSector(x.id, 1))}><Icono n="abajo" /></Button>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setAgregandoSub(agregandoSub === x.id ? null : x.id)}><Icono n="mas" /> Sub-sector</Button>
            </>}
          />
          {(x.subsectores.length > 0 || agregandoSub === x.id) && (
            <div className="mt-subsectores">
              {x.subsectores.map(sub => (
                <FilaNombre
                  key={sub.id}
                  id={sub.id}
                  nombre={sub.nombre}
                  detalle={sub.equipos ? `${sub.equipos} equipo${sub.equipos === 1 ? '' : 's'}` : 'Sin equipos todavía'}
                  editando={editando === sub.id}
                  onEditar={() => setEditando(sub.id)}
                  onCerrar={() => setEditando(null)}
                  sector={x}
                  hermanos={x.subsectores.map(y => y.nombre)}
                  hacer={hacer}
                />
              ))}
              {agregandoSub === x.id && <NuevoSubsector sector={x} onListo={() => setAgregandoSub(null)} hacer={hacer} />}
            </div>
          )}
        </div>
      ))}
    </Modal>
  );
}

type Hacer = (accion: () => Promise<void>, exito?: string) => Promise<boolean>;

function NuevoSubsector({ sector, onListo, hacer }: { sector: SectorConCantidad; onListo: () => void; hacer: Hacer }) {
  const s = useMantenimiento();
  const [nombre, setNombre] = useState('');
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (await hacer(() => s.crearSector(nombre.trim(), sector.id), `Sub-sector "${nombre.trim()}" creado en ${sector.nombre}`)) onListo();
  }
  return (
    <form onSubmit={enviar} style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
      <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={`Sub-sector nuevo de ${sector.nombre}`} aria-label={`Sub-sector nuevo de ${sector.nombre}`} autoFocus maxLength={80} />
      <Button type="submit" variant="primary" size="sm" disabled={!nombre.trim()}><Icono n="guardar" /> Crear</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onListo}>Cancelar</Button>
    </form>
  );
}

interface FilaProps {
  id: string;
  nombre: string;
  detalle: string;
  editando: boolean;
  onEditar: () => void;
  onCerrar: () => void;
  /** El sector (de este sector o del que contiene a este sub-sector). */
  sector: SectorConCantidad;
  /** Los nombres del mismo nivel, para avisar si se van a juntar. */
  hermanos: string[];
  principal?: boolean;
  extra?: React.ReactNode;
  /** Posición en el orden de importancia (solo sectores). */
  numero?: number;
  hacer: Hacer;
}

function FilaNombre({ id, nombre, detalle, editando, onEditar, onCerrar, sector, hermanos, principal, extra, numero, hacer }: FilaProps) {
  const s = useMantenimiento();
  const confirmar = useConfirm();
  const [valor, setValor] = useState(nombre);
  const tipo = principal ? 'sector' : 'sub-sector';

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const n = valor.trim();
    if (!n || n === nombre) { onCerrar(); return; }
    const otro = hermanos.find(h => normalizar(h) === normalizar(n) && normalizar(h) !== normalizar(nombre));
    if (otro && !(await confirmar(`Ya existe el ${tipo} "${otro}". ¿Juntar "${nombre}" con "${otro}"?`, { textoConfirmar: 'Juntar' }))) return;
    if (await hacer(() => s.renombrarSector(id, n), otro ? `Juntados en "${otro}"` : `Renombrado a "${n}"`)) onCerrar();
  }

  async function borrar() {
    const msg = principal
      ? `¿Borrar el sector "${nombre}"${sector.subsectores.length ? ' y sus sub-sectores' : ''}? Sus equipos quedan sin sector (no se borra ningún equipo).`
      : `¿Borrar el sub-sector "${nombre}"? Sus equipos quedan en ${sector.nombre}, sin sub-sector.`;
    if (!(await confirmar(msg, { textoConfirmar: 'Borrar', peligroso: true }))) return;
    await hacer(() => s.eliminarSector(id), principal ? 'Sector borrado' : 'Sub-sector borrado');
  }

  if (editando) {
    return (
      <form className="mt-fila" style={{ gap: 8 }} onSubmit={e => void guardar(e)}>
        <Input value={valor} onChange={e => setValor(e.target.value)} aria-label={`Nombre nuevo para ${nombre}`} autoFocus maxLength={80} />
        <Button type="submit" variant="primary" size="sm"><Icono n="guardar" /> Guardar</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCerrar}>Cancelar</Button>
      </form>
    );
  }
  return (
    <div className="mt-fila" style={{ alignItems: 'center' }}>
      <div className="mt-fila-cuerpo">
        <div className="mt-fila-titulo" style={principal ? undefined : { fontWeight: 600 }}>{numero != null && <span className="mt-orden-num">{numero}</span>}{nombre}</div>
        <div className="mt-fila-sub">{detalle}</div>
      </div>
      <div className="mt-fila-acciones" style={{ alignItems: 'center' }}>
        {extra}
        <Button variant="ghost" size="icon" title={`Cambiar nombre del ${tipo}`} aria-label={`Cambiar nombre de ${nombre}`} onClick={() => { setValor(nombre); onEditar(); }}><Icono n="editar" /></Button>
        <Button variant="dangerGhost" size="icon" title={`Borrar ${tipo}`} aria-label={`Borrar ${nombre}`} onClick={() => void borrar()}><Icono n="borrar" /></Button>
      </div>
    </div>
  );
}
