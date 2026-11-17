import { useEffect, useId, useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { generarQRPDF, type FormatoEtiqueta } from '../../lib/generarQrPdf';
import FormatoEtiquetaSelect from '../items/FormatoEtiquetaSelect';
import { sectoresConCantidad } from './sectores';
import type { EquipoDeLista, Sector } from './tipos';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { CampoDeCantidad } from '@/components/ui/cantidad';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

interface Props {
  /** Los equipos y los sectores (los lee la app). */
  cargar: () => Promise<{ equipos: EquipoDeLista[]; sectores: Sector[] }>;
}

interface Fila { equipo: EquipoDeLista; cantidad: number }

// Etiquetas QR de los equipos, en cantidad (pedido del dueño, 12/11/2026): se arma una lista sumando un sector entero (con sus sub-equipos),
// un equipo o un sub-equipo suelto, o todos; a cada uno se le pone cuántas etiquetas, y sale un solo PDF para imprimir (hoja A4, como las de
// los artículos del Depósito). El QR lleva el código del equipo: al escanearlo desde Mantenimiento se abre su ficha.
export default function EtiquetasQr({ cargar }: Props) {
  const uid = useId();
  const toast = useToast();
  const [datos, setDatos] = useState<{ equipos: EquipoDeLista[]; sectores: Sector[] } | null>(null);
  const [error, setError] = useState(false);
  const [sector, setSector] = useState('');
  const [conSubEquipos, setConSubEquipos] = useState(true);
  const [equipo, setEquipo] = useState('');
  const [lista, setLista] = useState<Fila[]>([]);
  const [formato, setFormato] = useState<FormatoEtiqueta>('qr_codigo_nombre');
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    let vigente = true;
    cargar().then(d => { if (vigente) setDatos(d); }, () => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [cargar]);

  const equipos = useMemo(() => datos?.equipos ?? [], [datos]);
  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const sectores = useMemo(() => sectoresConCantidad(datos?.sectores ?? [], equipos), [datos, equipos]);
  const opcionesEquipo = useMemo(() => equipos.map(e => {
    const padre = e.padreId ? porId.get(e.padreId) : null;
    return { value: e.id, label: `${e.codigo} — ${e.nombre}${padre ? ` (parte de ${padre.codigo})` : ''}`, buscar: [e.sector, e.subsector, ...e.etiquetas] };
  }), [equipos, porId]);

  /** Los equipos de un sector (o sub-sector): los del sector y sus sub-sectores, y si se pide, sus sub-equipos. */
  function delSector(id: string): EquipoDeLista[] {
    const s = sectores.find(x => x.id === id);
    const ids = new Set(s ? [s.id, ...s.subsectores.map(x => x.id)] : [id]);
    const principales = equipos.filter(e => e.sectorId && ids.has(e.sectorId));
    const elegidos = new Set(principales.map(e => e.id));
    if (conSubEquipos) for (const e of equipos) if (e.padreId && elegidos.has(e.padreId)) elegidos.add(e.id);
    return equipos.filter(e => elegidos.has(e.id));
  }

  function agregar(nuevos: EquipoDeLista[]) {
    const ya = new Set(lista.map(f => f.equipo.id));
    const sumar = nuevos.filter(e => !ya.has(e.id));
    if (!sumar.length) { toast(nuevos.length ? 'Ya estaban en la lista.' : 'No hay equipos para agregar.', 'error'); return; }
    setLista(l => [...l, ...sumar.map(e => ({ equipo: e, cantidad: 1 }))]);
    toast(sumar.length === 1 ? `Agregado ${sumar[0].codigo}` : `Agregados ${sumar.length} equipos`, 'success');
  }

  const total = lista.reduce((n, f) => n + f.cantidad, 0);

  async function descargar() {
    const items = lista.flatMap(f => Array.from({ length: f.cantidad }, () => ({ codigo: f.equipo.codigo, descripcion: f.equipo.nombre })));
    if (!items.length) return;
    setGenerando(true);
    try {
      await generarQRPDF(items, `QR-equipos-${new Date().toISOString().slice(0, 10)}.pdf`, formato);
    } finally {
      setGenerando(false);
    }
  }

  if (error) return <div className="mt-vacio">No se pudieron leer los equipos. Probá de nuevo.</div>;
  if (!datos) return <div className="mt-vacio">Cargando equipos...</div>;

  return (
    <div className="qr-equipos">
      <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 12px' }}>
        Armá la lista sumando sectores enteros o equipos sueltos, poné cuántas etiquetas querés de cada uno y descargá un solo PDF para imprimir.
        Al escanear la etiqueta desde Mantenimiento se abre la ficha del equipo.
      </p>

      <div className="qr-equipos-agregar">
        <div className="qr-equipos-fila">
          <div className="form-group" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}>
            <label htmlFor={`${uid}-s`}>Un sector entero</label>
            <Select id={`${uid}-s`} value={sector} onChange={e => setSector(e.target.value)}>
              <option value="">Elegí un sector...</option>
              {sectores.map(s => [
                <option key={s.id} value={s.id}>{s.nombre} ({s.equipos})</option>,
                ...s.subsectores.map(x => <option key={x.id} value={x.id}>{'   '}{s.nombre} › {x.nombre} ({x.equipos})</option>),
              ])}
            </Select>
          </div>
          <label className="qr-equipos-check">
            <input type="checkbox" checked={conSubEquipos} onChange={e => setConSubEquipos(e.target.checked)} /> Con sus sub-equipos
          </label>
          <Button type="button" variant="ghost" disabled={!sector} onClick={() => { agregar(delSector(sector)); setSector(''); }}><Icono n="mas" /> Agregar sector</Button>
        </div>
        <div className="qr-equipos-fila">
          <div className="form-group" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}>
            <label htmlFor={`${uid}-e`}>Un equipo o sub-equipo</label>
            <Combobox id={`${uid}-e`} value={equipo} onChange={setEquipo} opciones={opcionesEquipo} placeholder="Buscá por código o nombre (ej.: motor)" />
          </div>
          <Button type="button" variant="ghost" disabled={!equipo} onClick={() => { const e = porId.get(equipo); if (e) agregar([e]); setEquipo(''); }}><Icono n="mas" /> Agregar equipo</Button>
        </div>
        <div>
          <Button type="button" variant="ghost" size="sm" disabled={!equipos.length} onClick={() => agregar(equipos)}><Icono n="mas" /> Agregar todos los equipos ({equipos.length})</Button>
        </div>
      </div>

      <div className="mt-bloque" style={{ marginTop: 16 }}>
        <div className="mt-bloque-titulo">
          <span><Icono n="qr" /> Lista: {lista.length} {lista.length === 1 ? 'equipo' : 'equipos'} · {total} {total === 1 ? 'etiqueta' : 'etiquetas'}</span>
          {lista.length > 0 && <button type="button" className="mt-link" style={{ fontSize: 12 }} onClick={() => setLista([])}>Vaciar</button>}
        </div>
        {!lista.length ? <div className="mt-vacio">Todavía no agregaste equipos.</div> : (
          <ul className="qr-equipos-lista">
            {lista.map(({ equipo: e, cantidad }) => {
              const padre = e.padreId ? porId.get(e.padreId) : null;
              return (
                <li key={e.id}>
                  <div className="qr-equipos-nombre">
                    <strong>{e.codigo}</strong> — {e.nombre}
                    <span>{padre ? `Parte de ${padre.codigo} — ${padre.nombre}` : [e.sector, e.subsector].filter(Boolean).join(' › ') || 'Sin sector'}</span>
                  </div>
                  <CampoDeCantidad max={500} aria-label={`Etiquetas de ${e.codigo}`} valor={cantidad} style={{ width: 80 }}
                    onCambio={n => setLista(l => l.map(f => (f.equipo.id === e.id ? { ...f, cantidad: n } : f)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${e.codigo}`} onClick={() => setLista(l => l.filter(f => f.equipo.id !== e.id))}><Icono n="borrar" /></Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <FormatoEtiquetaSelect value={formato} onChange={setFormato} />
      <Button type="button" variant="primary" disabled={!total || generando} onClick={() => void descargar()}>
        <Icono n="imprimir" /> {generando ? 'Armando el PDF...' : `Descargar PDF (${total} ${total === 1 ? 'etiqueta' : 'etiquetas'})`}
      </Button>
    </div>
  );
}
