import { useMemo, useRef, useState, type FocusEvent } from 'react';
import { useToast } from '../../components/ToastProvider';
import { useFamiliasQuery, useRenameFamilia, useRenameSubfamilia, useSubfamiliasQuery } from '../familias/useFamilias';
import ImportarFamiliasModal from '../familias/ImportarFamiliasModal';
import { urlPlanillaFamilias, usePlanillaFamiliasQuery } from '../familias/useImportarFamilias';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

export default function FamiliasPane() {
  const { data: familias } = useFamiliasQuery();
  const { data: subfamilias } = useSubfamiliasQuery();
  const renameFamilia = useRenameFamilia();
  const renameSubfamilia = useRenameSubfamilia();
  const toast = useToast();
  const { data: planilla } = usePlanillaFamiliasQuery();

  const [busqueda, setBusqueda] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedTimeout = useRef<number | undefined>(undefined);
  const [importarOpen, setImportarOpen] = useState(false);
  // Las subfamilias arrancan colapsadas — con ~300 en total, mostrarlas todas
  // de una hacía la pantalla enorme. Se despliegan por familia, al tocarla.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  function flashSaved(id: string) {
    setSavedId(id);
    window.clearTimeout(savedTimeout.current);
    savedTimeout.current = window.setTimeout(() => setSavedId(prev => (prev === id ? null : prev)), 900);
  }

  function toggleExpandida(id: string) {
    setExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleRenameFamilia(id: string, e: FocusEvent<HTMLInputElement>) {
    const nombre = e.target.value.trim();
    const fam = familias?.find(f => f.id === id);
    if (!nombre || fam?.nombre === nombre) return;
    try {
      await renameFamilia.mutateAsync({ id, nombre });
      flashSaved(id);
    } catch {
      toast('Error al guardar el nombre', 'error');
    }
  }

  async function handleRenameSubfamilia(id: string, e: FocusEvent<HTMLInputElement>) {
    const nombre = e.target.value.trim();
    const sub = subfamilias?.find(s => s.id === id);
    if (!nombre || sub?.nombre === nombre) return;
    try {
      await renameSubfamilia.mutateAsync({ id, nombre });
      flashSaved(id);
    } catch {
      toast('Error al guardar el nombre', 'error');
    }
  }

  const hayBusqueda = busqueda.trim().length > 0;

  const bloques = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const ordenadas = [...(familias ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo));
    return ordenadas
      .map(f => {
        const subs = (subfamilias ?? [])
          .filter(s => s.familia_id === f.id)
          .sort((a, b) => a.codigo.localeCompare(b.codigo));
        const matchFam = !q || f.codigo.toLowerCase().includes(q) || f.nombre.toLowerCase().includes(q);
        const subsFiltradas = q ? subs.filter(s => matchFam || s.codigo.toLowerCase().includes(q) || s.nombre.toLowerCase().includes(q)) : subs;
        return { familia: f, subs, subsFiltradas, visible: !q || matchFam || subsFiltradas.length > 0 };
      })
      .filter(b => b.visible);
  }, [familias, subfamilias, busqueda]);

  return (
    <div className="admin-card">
      <div className="admin-card-header" style={{ justifyContent: 'space-between' }}>
        <span><Icono n="etiqueta" /> Familias y subfamilias</span>
        <Button size="sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: 12 }} onClick={() => setImportarOpen(true)}><Icono n="importar" /> Importar desde Excel</Button>
      </div>
      <div className="admin-card-body">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Los nombres se guardan solos al salir de cada campo (no hace falta un botón "Guardar"). Tocá una familia para ver sus subfamilias.
        </div>
        {planilla && (
          <p style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 14 }}>
            Última planilla de codificación:{' '}
            <a href={urlPlanillaFamilias(planilla.storage_path)} target="_blank" rel="noopener noreferrer">{planilla.nombre_archivo}</a>
            {' '}({new Date(planilla.actualizada_at).toLocaleDateString('es-AR')})
          </p>
        )}
        <Input type="text" placeholder="Buscar código o nombre..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ marginBottom: 14 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!bloques.length && <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Sin resultados</p>}
          {bloques.map(({ familia: f, subs, subsFiltradas }) => {
            // Con una búsqueda activa se muestran los resultados directo, sin
            // depender de si esa familia estaba expandida a mano o no.
            const abierta = hayBusqueda || expandidas.has(f.id);
            const subsAMostrar = hayBusqueda ? subsFiltradas : subs;
            return (
              <div key={f.id} style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => toggleExpandida(f.id)}
                    aria-label={abierta ? 'Contraer' : 'Expandir'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, display: 'flex' }}
                  >
                    <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: abierta ? 'rotate(90deg)' : 'none', color: 'var(--text-muted)' }}><Icono n="desplegar" /></span>
                  </button>
                  <span className="badge badge-rubro" style={{ minWidth: 32, justifyContent: 'center' }}>{f.codigo}</span>
                  <Input
                    type="text"
                    defaultValue={f.nombre}
                    placeholder="Nombre de la familia"
                    onBlur={e => void handleRenameFamilia(f.id, e)}
                    style={{ flex: 1, fontWeight: 700, transition: 'border-color .3s', borderColor: savedId === f.id ? 'var(--success)' : undefined }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{subs.length} sub.</span>
                </div>
                {abierta && subsAMostrar.length > 0 && (
                  <div style={{ paddingLeft: 16, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '2px solid var(--border)' }}>
                    {subsAMostrar.map(s => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
                        <span className="badge" style={{ minWidth: 32, justifyContent: 'center', fontSize: 11 }}>{s.codigo}</span>
                        <Input
                          type="text"
                          defaultValue={s.nombre}
                          placeholder="Nombre de la subfamilia"
                          onBlur={e => void handleRenameSubfamilia(s.id, e)}
                          style={{ flex: 1, fontSize: 13, transition: 'border-color .3s', borderColor: savedId === s.id ? 'var(--success)' : undefined }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <ImportarFamiliasModal open={importarOpen} onClose={() => setImportarOpen(false)} />
    </div>
  );
}
