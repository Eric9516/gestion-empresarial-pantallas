'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';
import { revisarFaltanteDeMantenimiento } from './acciones';

export interface Faltante { id: string; ot: string; fecha: string; equipo: string; codigo: string; descripcion: string; faltante: number }

// Lo que una orden de trabajo de Mantenimiento usó y no se pudo descontar porque no había stock (la OT se cerró igual: decisión del dueño).
// El Depósito lo revisa (el stock estaba mal cargado, o el repuesto salió de otro lado) y lo da por revisado.
export default function FaltantesDeMantenimiento({ faltantes, puedeRevisar }: { faltantes: Faltante[]; puedeRevisar: boolean }) {
  const [revisados, setRevisados] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const quedan = faltantes.filter(f => !revisados.has(f.id));
  if (!quedan.length) return null;

  async function revisar(id: string) {
    setError(null);
    const { error } = await revisarFaltanteDeMantenimiento(id);
    if (error) setError(error);
    else setRevisados(prev => new Set(prev).add(id));
  }

  return (
    <div className="para-atender-tarjeta alerta" style={{ gridColumn: '1 / -1', cursor: 'default' }}>
      <span className="para-atender-cabeza"><Icono n="alerta" /> Faltó descontar (Mantenimiento)</span>
      <span className="para-atender-detalle">
        Al terminar estas órdenes de trabajo no alcanzó el stock: se descontó lo que había y falta esto. Revisá si el stock estaba mal cargado o
        si el repuesto salió de otro lado.
      </span>
      <ul className="para-atender-lista" style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {quedan.map(f => (
          <li key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>
              <strong>{f.faltante} × {f.codigo}</strong> {f.descripcion} · {f.ot} ({f.equipo}, {f.fecha.split('-').reverse().join('/')})
            </span>
            {puedeRevisar && <Button variant="ghost" size="sm" onClick={() => void revisar(f.id)}><Icono n="ok" /> Ya lo revisé</Button>}
          </li>
        ))}
      </ul>
      {error && <span role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>}
    </div>
  );
}
