import { useEffect, useMemo, useState } from 'react';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { calcularDisponibilidad, periodo, PERIODOS, textoHoras, textoPorcentaje, type FilaDisponibilidad, type PeriodoId } from './disponibilidad';
import { useMantenimiento } from './servicio';
import type { Parada } from './tipos';
import { Icono } from '@/components/Icono';

// El Inicio de Mantenimiento (del socio, 06/11/2026): la disponibilidad de los equipos en el período elegido. Por ahora cuenta solo las
// paradas por mantenimiento (correctivo y preventivo, por separado); las paradas por producción y por fin de producción llegan más adelante.

const MAX_EQUIPOS = 10;

/** Barra con las horas paradas, partida en correctivo y preventivo. `escala` = horas que llenan la barra. */
function BarraParada({ fila, escala }: { fila: FilaDisponibilidad; escala: number }) {
  const ancho = (h: number) => (escala > 0 ? `${(h / escala) * 100}%` : '0%');
  return (
    <div className="mt-barra" aria-hidden="true">
      {fila.paradaCorrectivo > 0 && <span className="mt-barra-seg corr" style={{ width: ancho(fila.paradaCorrectivo) }} title={`Correctivo: ${textoHoras(fila.paradaCorrectivo)}`} />}
      {fila.paradaPreventivo > 0 && <span className="mt-barra-seg prev" style={{ width: ancho(fila.paradaPreventivo) }} title={`Preventivo: ${textoHoras(fila.paradaPreventivo)}`} />}
    </div>
  );
}

function detalle(f: FilaDisponibilidad): string {
  const total = f.paradaCorrectivo + f.paradaPreventivo;
  if (!total) return 'Sin paradas';
  const partes = [f.paradaCorrectivo > 0 && `${textoHoras(f.paradaCorrectivo)} correctivo`, f.paradaPreventivo > 0 && `${textoHoras(f.paradaPreventivo)} preventivo`].filter(Boolean);
  return `${textoHoras(total)} parado (${partes.join(' + ')})`;
}

function Leyenda() {
  return (
    <div className="mt-leyenda">
      <span><span className="mt-leyenda-color corr" /> Parado por correctivo</span>
      <span><span className="mt-leyenda-color prev" /> Parado por preventivo</span>
    </div>
  );
}

export default function PantallaDeInicio({ onVerEquipo }: { onVerEquipo: (id: string) => void }) {
  const s = useMantenimiento();
  const [periodoId, setPeriodoId] = useState<PeriodoId>('mes');
  const hoy = fechaHoyISO();
  const p = useMemo(() => periodo(periodoId, hoy), [periodoId, hoy]);
  // las paradas del período se piden al servidor (sale del historial de todos los equipos)
  const [paradas, setParadas] = useState<{ clave: string; lista: Parada[] } | null>(null);
  const clave = `${p.desde}|${p.hasta}|${s.revision}`;
  useEffect(() => {
    let vigente = true;
    s.paradas(p.desde, p.hasta).then(lista => { if (vigente) setParadas({ clave, lista }); }, () => { if (vigente) setParadas({ clave, lista: [] }); });
    return () => { vigente = false; };
  }, [s, p.desde, p.hasta, clave]);

  const sectores = useMemo(() => s.sectores.filter(x => !x.padreId).map(x => x.nombre), [s.sectores]);
  const r = useMemo(() => calcularDisponibilidad(s.equipos ?? [], paradas?.lista ?? [], p, sectores), [s.equipos, paradas, p, sectores]);
  const cargando = s.equipos === undefined || paradas?.clave !== clave;

  const g = r.general;
  const escalaSectores = Math.max(0, ...r.porSector.map(x => x.paradaCorrectivo + x.paradaPreventivo));
  const top = r.equipos.slice(0, MAX_EQUIPOS);
  const escalaEquipos = Math.max(0, ...top.map(e => e.paradaCorrectivo + e.paradaPreventivo));
  const hayParadas = g.paradaCorrectivo + g.paradaPreventivo > 0;

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title"><Icono n="inicio" /> Inicio</h1>
      </div>

      <div className="mt-chips" role="radiogroup" aria-label="Período">
        {PERIODOS.map(x => (
          <button key={x.id} type="button" role="radio" aria-checked={periodoId === x.id} className={`mt-chip${periodoId === x.id ? ' activo' : ''}`} onClick={() => setPeriodoId(x.id)}>{x.label}</button>
        ))}
      </div>
      <div className="mt-resumen">Del {formatearFechaSola(p.desde)} al {formatearFechaSola(p.hasta)} · 24 h por día · {g.equipos} {g.equipos === 1 ? 'equipo' : 'equipos'}</div>

      {cargando ? <div className="mt-vacio">{s.isError ? 'No se pudieron leer los equipos. Probá de nuevo.' : 'Cargando...'}</div> : (
        <>
          <div className="mt-kpis">
            <div className="mt-kpi principal">
              <div className="mt-kpi-label">Disponibilidad de los equipos</div>
              <div className="mt-kpi-valor">{textoPorcentaje(g.disponibilidad)}</div>
              <div className="mt-kpi-sub">{hayParadas ? detalle(g) : 'Sin paradas en el período'}</div>
            </div>
            <div className="mt-kpi">
              <div className="mt-kpi-label"><span className="mt-leyenda-color corr" /> Parado por correctivo</div>
              <div className="mt-kpi-valor">{textoHoras(g.paradaCorrectivo)}</div>
            </div>
            <div className="mt-kpi">
              <div className="mt-kpi-label"><span className="mt-leyenda-color prev" /> Parado por preventivo</div>
              <div className="mt-kpi-valor">{textoHoras(g.paradaPreventivo)}</div>
            </div>
          </div>

          <div className="mt-bloque">
            <div className="mt-bloque-titulo"><span><Icono n="fabrica" /> Por sector</span></div>
            {hayParadas && <Leyenda />}
            <div className="mt-disp-lista">
              {r.porSector.map(x => (
                <div key={x.sector} className="mt-disp-fila">
                  <div className="mt-disp-nombre">{x.sector} <span className="mt-disp-cant">{x.equipos} {x.equipos === 1 ? 'equipo' : 'equipos'}</span></div>
                  <BarraParada fila={x} escala={escalaSectores} />
                  <div className="mt-disp-datos"><strong>{textoPorcentaje(x.disponibilidad)}</strong> <span>{detalle(x)}</span></div>
                </div>
              ))}
              {r.porSector.length === 0 && <div className="mt-vacio">Todavía no hay equipos cargados.</div>}
            </div>
          </div>

          <div className="mt-bloque">
            <div className="mt-bloque-titulo"><span><Icono n="alerta" /> Equipos con más horas parados</span></div>
            {top.length === 0 ? (
              <div className="mt-vacio">Ningún equipo estuvo parado por mantenimiento en este período.</div>
            ) : (
              <>
                <Leyenda />
                <div className="mt-disp-lista">
                  {top.map(e => (
                    <button key={e.equipo.id} type="button" className="mt-disp-fila boton" onClick={() => onVerEquipo(e.equipo.id)}>
                      <div className="mt-disp-nombre">{e.equipo.nombre} <span className="mt-card-codigo">{e.equipo.codigo}</span></div>
                      <BarraParada fila={e} escala={escalaEquipos} />
                      <div className="mt-disp-datos"><strong>{textoPorcentaje(e.disponibilidad)}</strong> <span>{detalle(e)}</span></div>
                    </button>
                  ))}
                </div>
                {r.equipos.length > MAX_EQUIPOS && <div className="mt-resumen" style={{ marginTop: 8 }}>Y {r.equipos.length - MAX_EQUIPOS} equipos más con alguna parada.</div>}
              </>
            )}
          </div>
        </>
      )}

      <p className="mt-nota">
        Por ahora se cuentan solo las paradas por mantenimiento: las horas de equipo parado que se anotan al terminar una OT o al registrar un mantenimiento.
        Si para un sub-equipo, cuenta como parada de su equipo principal. Más adelante se suman las paradas por producción y por fin de producción.
      </p>
    </div>
  );
}
