import { formatearFechaSola } from '../../lib/fechaHoy';
import { horasDeTecnico, numeroCorto, totalHorasHombre } from './preventivo';
import type { Liberacion, TrabajoTecnico } from './tipos';
import { Icono } from '@/components/Icono';

// Técnicos (con horarios y horas hombre) y liberación del equipo de una OT terminada o de un registro del historial.
export default function DetalleCierre({ tecnicos, liberacion }: { tecnicos: TrabajoTecnico[]; liberacion: Liberacion | null }) {
  const total = totalHorasHombre(tecnicos);
  return (
    <>
      {tecnicos.length > 0 && (
        <div>
          <h4>Técnicos</h4>
          <table className="mt-tabla-chica">
            <thead><tr><th>Técnico</th><th>Fecha</th><th>Inicio</th><th>Término</th><th>HH</th></tr></thead>
            <tbody>
              {tecnicos.map(t => {
                const hh = horasDeTecnico(t);
                return <tr key={t.id}><td>{t.nombre}</td><td>{t.fecha ? formatearFechaSola(t.fecha) : '—'}</td><td>{t.inicio || '—'}</td><td>{t.fin || '—'}</td><td>{hh != null ? numeroCorto(hh) : '—'}</td></tr>;
              })}
            </tbody>
          </table>
          {total != null && tecnicos.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>Total: {numeroCorto(total)} horas hombre</div>}
        </div>
      )}
      {liberacion && (
        <div>
          <h4>Liberación del equipo</h4>
          <ul className="mt-hist-tareas">
            {liberacion.controles.map((c, i) => <li key={i} className={c.ok ? '' : 'no'}><Icono n={c.ok ? 'ok' : 'cerrar'} /> {c.texto}</li>)}
          </ul>
          <div style={{ fontSize: 13, marginTop: 4 }}>Recibió: <strong>{liberacion.recibio || '—'}</strong></div>
        </div>
      )}
    </>
  );
}
