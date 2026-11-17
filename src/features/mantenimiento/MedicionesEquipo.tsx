import { useMemo, useState } from 'react';
import { formatearFechaSola } from '../../lib/fechaHoy';
import { normalizar } from './buscador';
import { fueraDeRango, numeroCorto, numeroOT, textoRango } from './preventivo';
import type { Medicion, ValorMedido } from './tipos';
import { Icono } from '@/components/Icono';

interface Serie { clave: string; texto: string; medicion: Medicion; puntos: ValorMedido[] }

// Las mediciones anotadas en las OT terminadas del equipo (del diseño del socio), agrupadas por tarea: el último valor, cómo vienen
// cambiando (una línea chica con el rango normal pintado) y los últimos valores. Plegado, para no tapar el historial.
export default function MedicionesEquipo({ mediciones }: { mediciones: ValorMedido[] }) {
  const [abierto, setAbierto] = useState(false);
  const series = useMemo(() => {
    const m = new Map<string, Serie>();
    for (const v of mediciones) {
      const clave = `${normalizar(v.tarea)}|${normalizar(v.unidad)}`;
      const serie = m.get(clave) ?? { clave, texto: v.tarea, medicion: v, puntos: [] };
      serie.medicion = { unidad: v.unidad, minimo: v.minimo, maximo: v.maximo }; // el rango más reciente
      serie.puntos.push(v);
      m.set(clave, serie);
    }
    return [...m.values()];
  }, [mediciones]);
  if (!series.length) return null;
  const conAlerta = series.filter(x => fueraDeRango(x.medicion, x.puntos.at(-1)!.valor)).length;

  return (
    <div className="mt-bloque" style={{ padding: '10px 12px' }}>
      <button type="button" className="mt-hist-cabeza" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
        <span className="mt-bloque-titulo" style={{ flex: 1, margin: 0 }}>
          <span><Icono n="balanza" /> Mediciones ({series.length})</span>
          {conAlerta > 0 && <span className="mt-tag falta"><Icono n="alerta" /> {conAlerta} fuera de rango en la última</span>}
        </span>
        <span style={{ color: 'var(--text-mid)', display: 'inline-flex', transform: abierto ? 'rotate(180deg)' : undefined }}><Icono n="abajo" /></span>
      </button>
      {abierto && series.map(x => {
        const ultimo = x.puntos.at(-1)!;
        return (
          <div key={x.clave} className="mt-medicion">
            <div className="mt-medicion-cab">
              <span style={{ fontWeight: 700, fontSize: 14 }}>{x.texto}</span>
              <span style={{ fontSize: 12, color: 'var(--text-mid)' }}>{textoRango(x.medicion)}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              Último: <strong style={{ color: fueraDeRango(x.medicion, ultimo.valor) ? 'var(--danger)' : undefined }}>{numeroCorto(ultimo.valor)} {x.medicion.unidad}</strong> el {formatearFechaSola(ultimo.fecha)}
            </div>
            {x.puntos.length > 1 && <Sparkline puntos={x.puntos.map(p => p.valor)} medicion={x.medicion} />}
            <div className="mt-medicion-valores">
              {x.puntos.slice(-8).reverse().map((p, k) => (
                <span key={k} className={fueraDeRango(x.medicion, p.valor) ? 'fuera' : ''} title={numeroOT(p.ot)}>{formatearFechaSola(p.fecha)}: {numeroCorto(p.valor)}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Línea chica con la evolución de una medición; la franja verde es el rango normal. */
function Sparkline({ puntos, medicion }: { puntos: number[]; medicion: Medicion }) {
  const W = 260;
  const H = 46;
  const P = 5;
  const todos = [...puntos, ...(medicion.minimo != null ? [medicion.minimo] : []), ...(medicion.maximo != null ? [medicion.maximo] : [])];
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);
  if (hi === lo) { hi += 1; lo -= 1; }
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - P * 2);
  const x = (i: number) => P + (i / Math.max(1, puntos.length - 1)) * (W - P * 2);
  const yMin = medicion.minimo != null ? y(medicion.minimo) : H - P;
  const yMax = medicion.maximo != null ? y(medicion.maximo) : P;
  return (
    <svg className="mt-sparkline" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución de la medición">
      {(medicion.minimo != null || medicion.maximo != null) && <rect x={0} y={yMax} width={W} height={Math.max(0, yMin - yMax)} fill="var(--success-bg)" />}
      <polyline points={puntos.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--blue)" strokeWidth={2} />
      {puntos.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={fueraDeRango(medicion, v) ? 'var(--danger)' : 'var(--blue)'} />)}
    </svg>
  );
}
