import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { formatearFechaSola } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { useMantenimiento } from './servicio';
import EquipoForm from './EquipoForm';
import type { Equipo, EquipoDeLista } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

// Solapa "Sub-equipos" de un equipo principal (del diseño del socio): la lista de sus partes, cada una con su propio historial, repuestos,
// manuales y QR. Tocando una se abre su ficha.
export function SolapaSubEquipos({ padre, subEquipos, onAbrir }: { padre: Equipo; subEquipos: EquipoDeLista[]; onAbrir: (id: string) => void }) {
  const s = useMantenimiento();
  const [nuevo, setNuevo] = useState(false);

  return (
    <div>
      {s.esAdmin && (
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
        const ult = e.resumen.ultimo;
        const marca = [e.marca, e.modelo].filter(Boolean).join(' ');
        return (
          <div key={e.id} className="mt-fila">
            <div className="mt-fila-cuerpo">
              <div className="mt-tags" style={{ marginBottom: 3 }}>
                <span className="mt-card-codigo">{e.codigo}</span>
                {e.critico && <span className="mt-tag critico">Crítico</span>}
                {e.resumen.faltaRepuesto && <span className="mt-tag falta"><Icono n="alerta" /> Falta repuesto</span>}
              </div>
              <div className="mt-fila-titulo">{e.nombre}</div>
              <div className="mt-fila-sub">
                {[marca, ult ? `Último: ${formatearFechaSola(ult.fecha)} (${ult.tipo})` : 'Sin historial'].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onAbrir(e.id)}>Abrir <Icono n="desplegar" /></Button>
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

interface PropsDuplicar {
  equipo: Equipo | null;
  subEquipos: Equipo[];
  cantRepuestos: number;
  onClose: () => void;
  onCreado: (id: string) => void;
}

// Copia un equipo con sus sub-equipos y repuestos críticos para cargar rápido equipos iguales, como varios pasteurizadores.
export function DuplicarEquipoModal({ equipo, ...props }: PropsDuplicar) {
  return (
    <Modal open={!!equipo} onClose={props.onClose} title={<><Icono n="repetir" /> Duplicar {equipo?.codigo}</>}>
      {equipo && <FormDuplicar equipo={equipo} {...props} />}
    </Modal>
  );
}

function FormDuplicar({ equipo, subEquipos: hijos, cantRepuestos, onClose, onCreado }: PropsDuplicar & { equipo: Equipo }) {
  const uid = useId();
  const toast = useToast();
  const s = useMantenimiento();
  const usados = useMemo(() => new Set((s.equipos ?? []).map(e => e.codigo.toLowerCase())), [s.equipos]);
  const [codigo, setCodigo] = useState(() => siguienteCodigo(equipo.codigo, usados));
  const [nombre, setNombre] = useState(() => siguienteNombre(equipo.nombre, siguienteCodigo(equipo.codigo, usados)));
  const [serie, setSerie] = useState('');
  const [guardando, setGuardando] = useState(false);
  const codigoHijo = (c: string) => (c.startsWith(equipo.codigo) ? codigo.trim() + c.slice(equipo.codigo.length) : `${codigo.trim()}-${c}`);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim() || !nombre.trim()) { toast('Completá el código y el nombre.', 'error'); return; }
    setGuardando(true);
    try {
      const id = await s.duplicarEquipo({ id: equipo.id, codigo: codigo.trim(), nombre: nombre.trim(), numeroSerie: serie.trim() });
      toast(`${codigo.trim()} creado${hijos.length ? ` con ${hijos.length} sub-equipos` : ''}`, 'success');
      onClose();
      onCreado(id);
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 0 }}>
        Se crea un equipo nuevo igual a <strong>{equipo.codigo}</strong>
        {hijos.length > 0 && <> con sus <strong>{hijos.length} sub-equipos</strong></>}
        {cantRepuestos > 0 && <> y sus repuestos críticos</>}. El historial y los manuales no se copian.
      </p>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${uid}-c`}>Código del nuevo *</label>
          <Input id={`${uid}-c`} data-autofocus value={codigo} onChange={e => setCodigo(e.target.value)} maxLength={40} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-n`}>Nombre *</label>
          <Input id={`${uid}-n`} value={nombre} onChange={e => setNombre(e.target.value)} maxLength={160} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-s`}>N.º de serie</label>
          <Input id={`${uid}-s`} value={serie} onChange={e => setSerie(e.target.value)} maxLength={120} />
        </div>
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
        <Button type="submit" variant="primary" disabled={guardando}><Icono n="repetir" /> {guardando ? 'Duplicando...' : 'Duplicar'}</Button>
      </div>
    </form>
  );
}
