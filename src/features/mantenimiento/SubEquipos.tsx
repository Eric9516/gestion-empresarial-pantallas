import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { diasDeAviso, estadoAviso } from './preventivo';
import { useDuplicarEquipo, useEquiposQuery, useIntervencionesQuery, useRepuestosCriticosQuery } from './useEquipos';
import { useOrdenesQuery, useRutinasQuery } from './usePreventivo';
import EquipoForm from './EquipoForm';
import type { Equipo } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

// Solapa "Sub-equipos" de un equipo principal: la lista de sus partes (cada una es un equipo con
// su propio historial, repuestos, manuales, rutinas y QR). Tocando una se abre su ficha.
export function SolapaSubEquipos({ padre, subEquipos, esAdmin, onAbrir }: { padre: Equipo; subEquipos: Equipo[]; esAdmin: boolean; onAbrir: (id: string) => void }) {
  const { data: intervenciones } = useIntervencionesQuery();
  const { data: ordenes } = useOrdenesQuery();
  const { data: rutinas } = useRutinasQuery();
  const [nuevo, setNuevo] = useState(false);
  const hoy = fechaHoyISO();

  return (
    <div>
      {esAdmin && (
        <div className="mt-acciones">
          <Button variant="primary" size="sm" onClick={() => setNuevo(true)}><Icono n="mas" /> Agregar sub-equipo</Button>
        </div>
      )}
      {!subEquipos.length && (
        <div className="mt-vacio">
          No tiene sub-equipos. Sirven para las partes que tienen su propio mantenimiento (ej.: las bombas, la placa o la separadora de un pasteurizador).
        </div>
      )}
      {subEquipos.map(e => {
        const ult = intervenciones.filter(i => i.equipoId === e.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
        const ot = ordenes.filter(o => o.equipoId === e.id && o.estado !== 'terminada').sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada))[0];
        const estado = ot ? estadoAviso(ot, hoy, diasDeAviso(ot, rutinas)) : null;
        return (
          <div key={e.id} className="mt-fila" style={{ cursor: 'pointer' }} onClick={() => onAbrir(e.id)}>
            <div className="mt-fila-cuerpo">
              <div className="mt-tags" style={{ marginBottom: 3 }}>
                <span className="mt-card-codigo">{e.codigo}</span>
                {e.critico && <span className="mt-tag critico">Crítico</span>}
                {ot && estado && estado !== 'programada' && (
                  <span className={`mt-tag ${estado}`}>{estado === 'vencida' ? 'OT vencida' : 'OT por vencer'} {formatearFechaSola(ot.fechaProgramada)}</span>
                )}
              </div>
              <div className="mt-fila-titulo">{e.nombre}</div>
              <div className="mt-fila-sub">
                {[e.marca, e.modelo].filter(Boolean).join(' ')}
                {ult ? `${e.marca || e.modelo ? ' · ' : ''}Último: ${formatearFechaSola(ult.fecha)} (${ult.tipo})` : `${e.marca || e.modelo ? ' · ' : ''}Sin historial`}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={ev => { ev.stopPropagation(); onAbrir(e.id); }}>Abrir <Icono n="desplegar" /></Button>
          </div>
        );
      })}
      <EquipoForm open={nuevo} onClose={() => setNuevo(false)} equipo={null} padre={padre} />
    </div>
  );
}

/** Siguiente código probable: PA-01 → PA-02 (si ya existe, sigue sumando). */
function siguienteCodigo(codigo: string, usados: Set<string>): string {
  const m = /^(.*?)(\d+)$/.exec(codigo);
  if (!m) return `${codigo}-2`;
  let n = Number(m[2]);
  let c = codigo;
  do { n += 1; c = m[1] + String(n).padStart(m[2].length, '0'); } while (usados.has(c.toLowerCase()));
  return c;
}

/** "Pasteurizador 1" → "Pasteurizador 3" si el código nuevo es PA-03 (toma el número del código). */
function siguienteNombre(nombre: string, codigoNuevo: string): string {
  const m = /^(.*?)(\d+)$/.exec(nombre.trim());
  const n = /(\d+)$/.exec(codigoNuevo)?.[1];
  if (m && n) return `${m[1]}${Number(n)}`;
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${nombre} (copia)`;
}

// Copia un equipo con sus sub-equipos y repuestos críticos (y, si se quiere, sus rutinas) para cargar
// rápido equipos iguales, como varios pasteurizadores.
export function DuplicarEquipoModal({ equipo, onClose, onCreado }: { equipo: Equipo | null; onClose: () => void; onCreado: (id: string) => void }) {
  return (
    <Modal open={!!equipo} onClose={onClose} title={<><Icono n="repetir" /> Duplicar {equipo?.codigo}</>}>
      {equipo && <FormDuplicar equipo={equipo} onClose={onClose} onCreado={onCreado} />}
    </Modal>
  );
}

function FormDuplicar({ equipo, onClose, onCreado }: { equipo: Equipo; onClose: () => void; onCreado: (id: string) => void }) {
  const uid = useId();
  const toast = useToast();
  const duplicar = useDuplicarEquipo();
  const { data: equipos } = useEquiposQuery();
  const { data: repuestos } = useRepuestosCriticosQuery();
  const { data: rutinas } = useRutinasQuery();
  const usados = useMemo(() => new Set(equipos.map(e => e.codigo.toLowerCase())), [equipos]);
  const [codigo, setCodigo] = useState(() => siguienteCodigo(equipo.codigo, usados));
  const [nombre, setNombre] = useState(() => siguienteNombre(equipo.nombre, siguienteCodigo(equipo.codigo, usados)));
  const [serie, setSerie] = useState('');
  const [conRutinas, setConRutinas] = useState(true);

  const hijos = equipos.filter(e => e.padreId === equipo.id);
  const ids = new Set([equipo.id, ...hijos.map(h => h.id)]);
  const cantRepuestos = repuestos.filter(r => ids.has(r.equipoId)).length;
  const cantRutinas = rutinas.filter(r => ids.has(r.equipoId)).length;
  const codigoHijo = (c: string) => (c.startsWith(equipo.codigo) ? codigo.trim() + c.slice(equipo.codigo.length) : `${codigo.trim()}-${c}`);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    try {
      const id = await duplicar.mutateAsync({ id: equipo.id, codigo, nombre, numeroSerie: serie, conRutinas });
      toast(`${codigo.trim()} creado${hijos.length ? ` con ${hijos.length} sub-equipos` : ''}`, 'success');
      onClose();
      onCreado(id);
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <form onSubmit={enviar}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 0 }}>
        Se crea un equipo nuevo igual a <strong>{equipo.codigo}</strong>
        {hijos.length > 0 && <> con sus <strong>{hijos.length} sub-equipos</strong></>}
        {cantRepuestos > 0 && <> y sus {cantRepuestos} repuestos críticos</>}. El historial, los manuales y las OT no se copian.
      </p>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${uid}-c`}>Código del nuevo *</label>
          <Input id={`${uid}-c`} data-autofocus value={codigo} onChange={e => setCodigo(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-n`}>Nombre *</label>
          <Input id={`${uid}-n`} value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-s`}>N.º de serie</label>
          <Input id={`${uid}-s`} value={serie} onChange={e => setSerie(e.target.value)} />
        </div>
        {cantRutinas > 0 && (
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontWeight: 700 }}>
              <input type="checkbox" checked={conRutinas} onChange={e => setConRutinas(e.target.checked)} style={{ width: 18, height: 18 }} />
              Copiar también sus {cantRutinas} rutinas preventivas
            </label>
          </div>
        )}
      </div>
      {hijos.length > 0 && codigo.trim() && (
        <div className="mt-bloque" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="mt-bloque-titulo"><span>Los sub-equipos van a quedar así</span></div>
          {hijos.map(h => (
            <div key={h.id} style={{ fontSize: 13, padding: '3px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>{h.codigo}</span> → <strong>{codigoHijo(h.codigo)}</strong> · {h.nombre}
            </div>
          ))}
        </div>
      )}
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="repetir" /> Duplicar</Button>
      </div>
    </form>
  );
}
