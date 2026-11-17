import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { mensajeDeError } from '../../lib/errores';
import { useMantenimiento } from './servicio';
import type { FranjaRecepcion } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

// Formato de la OT (del diseño del socio; uno por empresa, lo elige quien administra): los datos del registro de calidad que salen en el
// encabezado de la OT impresa, los controles de la liberación del equipo al terminar y (del socio, 10/11/2026) el horario en que les llegan
// las OT terminadas al jefe de taller y al responsable.
export default function FormatoOTModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={<><Icono n="config" /> Formato de la OT</>}>
      {open && <Formulario onClose={onClose} />}
    </Modal>
  );
}

const DIAS: [number, string][] = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];

function Formulario({ onClose }: { onClose: () => void }) {
  const uid = useId();
  const toast = useToast();
  const s = useMantenimiento();
  const [codigo, setCodigo] = useState(s.config.registroCodigo);
  const [version, setVersion] = useState(s.config.registroVersion);
  const [vigencia, setVigencia] = useState(s.config.registroVigencia);
  const [controles, setControles] = useState(s.config.controlesLiberacion.join('\n'));
  const [recibe, setRecibe] = useState(s.config.recibeLiberacion);
  const [horario, setHorario] = useState(s.config.horarioRecepcion);
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await s.guardarConfig({
        ...s.config,
        // se descartan los días con el horario al revés (hasta antes que desde)
        horarioRecepcion: { dias: horario.dias.filter(d => d.desde < d.hasta).sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7)) },
        registroCodigo: codigo.trim(), registroVersion: version.trim(), registroVigencia: vigencia,
        controlesLiberacion: controles.split(/\r?\n/).map(c => c.trim()).filter(Boolean), recibeLiberacion: recibe.trim(),
      });
      toast('Formato guardado: se usa en las próximas OT que imprimas o termines', 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 12px' }}>Registro de calidad: sale arriba a la derecha de cada OT impresa. Dejalo vacío si no lo usás.</p>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${uid}-c`}>Código del registro</label>
          <Input id={`${uid}-c`} value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ej.: REG-MANT-01" maxLength={60} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-v`}>Versión</label>
          <Input id={`${uid}-v`} value={version} onChange={e => setVersion(e.target.value)} placeholder="Ej.: 01" maxLength={30} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-f`}>Fecha de vigencia</label>
          <Input id={`${uid}-f`} type="date" value={vigencia} onChange={e => setVigencia(e.target.value)} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-l`}>Liberación del equipo: controles de entrega (uno por renglón)</label>
          <Textarea id={`${uid}-l`} rows={6} value={controles} onChange={e => setControles(e.target.value)} placeholder={'Sin objetos extraños\nLimpieza\nSanitización'} />
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>Se tildan al terminar cada OT y salen en la OT impresa. Vacío = las OT no tienen liberación.</div>
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-r`}>Quién recibe el equipo</label>
          <Input id={`${uid}-r`} value={recibe} onChange={e => setRecibe(e.target.value)} placeholder="Ej.: Responsable de Producción" maxLength={120} />
        </div>
        <fieldset className="form-group full" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Horario en que llegan las OT terminadas (al jefe de taller y al responsable)</legend>
          <div className="mt-horario">
            {DIAS.map(([n, nombre]) => {
              const f = horario.dias.find(d => d.dia === n);
              const cambiar = (c: Partial<FranjaRecepcion>) => setHorario(h => ({ dias: h.dias.map(d => (d.dia === n ? { ...d, ...c } : d)) }));
              return (
                <div key={n} className="mt-horario-dia">
                  <label>
                    <input type="checkbox" checked={!!f} onChange={e => setHorario(h => ({ dias: e.target.checked ? [...h.dias, { dia: n, desde: '08:30', hasta: n === 6 ? '12:00' : '17:00' }] : h.dias.filter(d => d.dia !== n) }))} />
                    {nombre}
                  </label>
                  {f ? (
                    <span className="mt-horario-horas">
                      de <Input type="time" aria-label={`${nombre} desde`} value={f.desde} onChange={e => cambiar({ desde: e.target.value })} />
                      a <Input type="time" aria-label={`${nombre} hasta`} value={f.hasta} onChange={e => cambiar({ hasta: e.target.value })} />
                    </span>
                  ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No se reciben</span>}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>Las que se terminan fuera de horario esperan y llegan al empezar el próximo día marcado.</div>
        </fieldset>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={guardando}><Icono n="guardar" /> {guardando ? 'Guardando...' : 'Guardar'}</Button>
      </div>
    </form>
  );
}
