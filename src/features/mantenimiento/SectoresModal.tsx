import { useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { mensajeDeError } from '../../lib/errores';
import { normalizar } from './buscador';
import {
  useCrearSector, useCrearSubsector, useEliminarSector, useEliminarSubsector, useRenombrarSector, useRenombrarSubsector,
  useMoverSector, useSectoresMantenimiento, type SectorConCantidad,
} from './useEquipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

// Sectores y sub-sectores de Mantenimiento: crear, renombrar (en todos sus equipos), juntar y borrar.
// Dos niveles fijos (Sector → Sub-sector). Son aparte de los sectores del Depósito.

/** Qué se está editando: un sector, o un sub-sector dentro de un sector. */
type Edicion = { sector: string; sub: string | null };

export default function SectoresModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sectores = useSectoresMantenimiento();
  const crear = useCrearSector();
  const mover = useMoverSector();
  const toast = useToast();
  const nombres = sectores.map(s => s.nombre);
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState<Edicion | null>(null);
  const [agregandoSub, setAgregandoSub] = useState<string | null>(null);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await crear.mutateAsync(nuevo);
      toast(`Sector "${nuevo.trim()}" creado`, 'success');
      setNuevo('');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <Modal open={open} onClose={() => { setEditando(null); setAgregandoSub(null); onClose(); }} large title={<><Icono n="fabrica" /> Sectores</>}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 0 }}>
        Cada sector puede tener sub-sectores (ej.: Servicios → Aire comprimido, Frío, Vapor). Si cambiás un nombre, se cambia en todos
        sus equipos; si le ponés el nombre de otro que ya existe, se juntan. Con las flechas ordenás los sectores por importancia:
        así aparecen en los filtros.
      </p>
      <form onSubmit={agregar} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="Nombre del sector nuevo" aria-label="Nombre del sector nuevo" data-autofocus />
        <Button type="submit" variant="primary" disabled={!nuevo.trim()}><Icono n="mas" /> Agregar sector</Button>
      </form>
      {!sectores.length && <div className="mt-vacio">Todavía no hay sectores.</div>}
      {sectores.map((s, i) => (
        <div key={s.nombre} className="mt-sector">
          <FilaNombre
            nombre={s.nombre}
            detalle={s.equipos ? `${s.equipos} equipo${s.equipos === 1 ? '' : 's'}` : 'Sin equipos todavía'}
            editando={editando?.sector === s.nombre && editando.sub === null}
            onEditar={() => setEditando({ sector: s.nombre, sub: null })}
            onCerrar={() => setEditando(null)}
            sector={s}
            hermanos={sectores.map(x => x.nombre)}
            principal
            numero={i + 1}
            extra={<>
              <span className="mt-orden">
                <Button variant="ghost" size="icon" title="Subir (más importante)" aria-label={`Subir ${s.nombre}`} disabled={i === 0} onClick={() => void mover.mutateAsync({ actuales: nombres, nombre: s.nombre, delta: -1 })}><Icono n="arriba" /></Button>
                <Button variant="ghost" size="icon" title="Bajar" aria-label={`Bajar ${s.nombre}`} disabled={i === sectores.length - 1} onClick={() => void mover.mutateAsync({ actuales: nombres, nombre: s.nombre, delta: 1 })}><Icono n="abajo" /></Button>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setAgregandoSub(agregandoSub === s.nombre ? null : s.nombre)}><Icono n="mas" /> Sub-sector</Button>
            </>}
          />
          {(s.subsectores.length > 0 || agregandoSub === s.nombre) && (
            <div className="mt-subsectores">
              {s.subsectores.map(sub => (
                <FilaNombre
                  key={sub.nombre}
                  nombre={sub.nombre}
                  detalle={sub.equipos ? `${sub.equipos} equipo${sub.equipos === 1 ? '' : 's'}` : 'Sin equipos todavía'}
                  editando={editando?.sector === s.nombre && editando.sub === sub.nombre}
                  onEditar={() => setEditando({ sector: s.nombre, sub: sub.nombre })}
                  onCerrar={() => setEditando(null)}
                  sector={s}
                  hermanos={s.subsectores.map(x => x.nombre)}
                />
              ))}
              {agregandoSub === s.nombre && <NuevoSubsector sector={s.nombre} onListo={() => setAgregandoSub(null)} />}
            </div>
          )}
        </div>
      ))}
    </Modal>
  );
}

function NuevoSubsector({ sector, onListo }: { sector: string; onListo: () => void }) {
  const crear = useCrearSubsector();
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await crear.mutateAsync({ sector, nombre });
      toast(`Sub-sector "${nombre.trim()}" creado en ${sector}`, 'success');
      onListo();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }
  return (
    <form onSubmit={enviar} style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
      <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={`Sub-sector nuevo de ${sector}`} aria-label={`Sub-sector nuevo de ${sector}`} autoFocus />
      <Button type="submit" variant="primary" size="sm" disabled={!nombre.trim()}><Icono n="guardar" /> Crear</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onListo}>Cancelar</Button>
    </form>
  );
}

interface FilaProps {
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
}

function FilaNombre({ nombre, detalle, editando, onEditar, onCerrar, sector, hermanos, principal, extra, numero }: FilaProps) {
  const renombrarSector = useRenombrarSector();
  const renombrarSub = useRenombrarSubsector();
  const eliminarSector = useEliminarSector();
  const eliminarSub = useEliminarSubsector();
  const toast = useToast();
  const confirmar = useConfirm();
  const [valor, setValor] = useState(nombre);
  const tipo = principal ? 'sector' : 'sub-sector';

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const n = valor.trim();
    if (!n || n === nombre) { onCerrar(); return; }
    const otro = hermanos.find(h => normalizar(h) === normalizar(n) && normalizar(h) !== normalizar(nombre));
    if (otro && !(await confirmar(`Ya existe el ${tipo} "${otro}". ¿Juntar "${nombre}" con "${otro}"?`, { textoConfirmar: 'Juntar' }))) return;
    try {
      if (principal) await renombrarSector.mutateAsync({ viejo: nombre, nuevo: n });
      else await renombrarSub.mutateAsync({ sector: sector.nombre, viejo: nombre, nuevo: n });
      toast(otro ? `Juntados en "${otro}"` : `Renombrado a "${n}"`, 'success');
      onCerrar();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  async function borrar() {
    const msg = principal
      ? `¿Borrar el sector "${nombre}"${sector.subsectores.length ? ' y sus sub-sectores' : ''}? Sus equipos quedan sin sector (no se borra ningún equipo).`
      : `¿Borrar el sub-sector "${nombre}"? Sus equipos quedan en ${sector.nombre}, sin sub-sector.`;
    if (!(await confirmar(msg, { textoConfirmar: 'Borrar', peligroso: true }))) return;
    if (principal) await eliminarSector.mutateAsync(nombre);
    else await eliminarSub.mutateAsync({ sector: sector.nombre, nombre });
    toast(principal ? 'Sector borrado' : 'Sub-sector borrado', 'success');
  }

  if (editando) {
    return (
      <form className="mt-fila" style={{ gap: 8 }} onSubmit={e => void guardar(e)}>
        <Input value={valor} onChange={e => setValor(e.target.value)} aria-label={`Nombre nuevo para ${nombre}`} autoFocus />
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
        <Button variant="ghost" size="icon" title={`Cambiar nombre del ${tipo}`} onClick={() => { setValor(nombre); onEditar(); }}><Icono n="editar" /></Button>
        <Button variant="dangerGhost" size="icon" title={`Borrar ${tipo}`} onClick={() => void borrar()}><Icono n="borrar" /></Button>
      </div>
    </div>
  );
}
