import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { MODULOS, dependientesEnUso, requisitosFaltantes, type ModuloId } from '../../lib/modulos';
import { useModulos } from '../config/useModulos';
import { Icono } from '@/components/Icono';

// El dueño apaga (o vuelve a prender) los módulos de su plan que no usa. No puede prender nada que el plan no incluya:
// eso lo define quien vende, y la base de datos lo hace cumplir aunque alguien intente saltearse esta pantalla.
export default function ModulosPane() {
  const { modulos, contratados, apagados, leida, listo } = useModulos();
  const toast = useToast();
  const confirmar = useConfirm();
  const queryClient = useQueryClient();
  const [trabajando, setTrabajando] = useState<ModuloId | null>(null);

  const incluidos = leida ? MODULOS.filter(m => contratados[m.id]) : [];

  async function cambiar(id: ModuloId, apagar: boolean) {
    const info = MODULOS.find(m => m.id === id)!;
    if (apagar) {
      const usan = dependientesEnUso(id, modulos);
      if (usan.length) { toast(`Primero apagá ${usan.map(m => `"${m.nombre}"`).join(' y ')}: necesita${usan.length > 1 ? 'n' : ''} "${info.nombre}".`, 'error'); return; }
      const ok = await confirmar(`Se bloquea para todos, también para vos: ${info.bloquea}.

Los datos no se borran: si lo volvés a prender, vuelven a estar.`, {
        titulo: `¿Apagar "${info.nombre}"?`,
        textoConfirmar: 'Apagar',
        peligroso: true,
      });
      if (!ok) return;
    } else {
      const faltan = requisitosFaltantes(id, modulos);
      if (faltan.length) { toast(`Primero prendé ${faltan.map(m => `"${m.nombre}"`).join(' y ')}: "${info.nombre}" lo necesita.`, 'error'); return; }
    }
    setTrabajando(id);
    try {
      const { error } = await supabase.rpc('definir_modulo_del_dueno', { p_modulo: id, p_apagado: apagar });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['licencia'] });
      toast(apagar ? `"${info.nombre}" apagado` : `"${info.nombre}" prendido`, 'success');
    } catch (e) {
      toast('No se pudo cambiar: ' + mensajeDeError(e), 'error');
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header"><Icono n="modulos" /> Módulos</div>
      <div className="admin-card-body">
        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 0 }}>
          Estos son los módulos de tu plan. Podés apagar los que no uses: dejan de verse y se bloquean para todos. No se borra ningún dato.
          Para sumar módulos nuevos a tu plan, consultá con tu proveedor.
        </p>
        {!listo && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>}
        {listo && !leida && <p style={{ color: 'var(--danger)', fontSize: 13 }}>No se pudo leer la licencia. Probá de nuevo en un momento.</p>}
        {listo && leida && incluidos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Tu plan todavía no tiene módulos activados.</p>}
        {incluidos.map(m => {
          const prendido = !apagados[m.id];
          // Si está apagado porque le falta algo que necesita (no porque lo apagó el dueño), se lo explica.
          const efectivo = modulos[m.id];
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{m.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{m.descripcion}</div>
                {prendido && !efectivo && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>Está sin uso porque falta un módulo que necesita.</div>}
              </div>
              <Button
                size="sm"
                variant={prendido ? 'success' : 'ghost'}
                disabled={trabajando !== null}
                aria-pressed={prendido}
                onClick={() => void cambiar(m.id, prendido)}
              >
                {trabajando === m.id ? '…' : prendido ? 'Prendido' : 'Apagado'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
