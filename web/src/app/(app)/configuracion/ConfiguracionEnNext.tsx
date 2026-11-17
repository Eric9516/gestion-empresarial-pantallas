'use client';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import PantallaDeConfiguracion from '@/features/admin/PantallaDeConfiguracion';
import { ContextoDeConfiguracion, type Configuracion, type ServicioDeConfiguracion } from '@/features/admin/servicioDeConfiguracion';
import { argumentosDelHistorial } from '@/features/admin/historialDeActividad';
import type { integraciones, Modulos } from '@/lib/modulos';
import type { LetraPdf } from '@/lib/preferencias';
import type { Profile } from '@/lib/types';
import { guardarPreferencias } from '~/lib/preferencias';
import { buscarParaElegir } from '../deposito/acciones';
import { ACCIONES_DE_MOVIMIENTO } from '../deposito/accionesEnElNavegador';
import FormularioEnNext, { type DatosDelFormulario } from '../deposito/FormularioEnNext';
import * as a from './acciones';
import ExcelEnNext from '../mantenimiento/excel/ExcelEnNext';
import EtiquetasQrEnNext from '../mantenimiento/EtiquetasQrEnNext';
import AvisosDelEquipo from '../mantenimiento/AvisosDelEquipo';

interface Props {
  perfil: Profile;
  config: Configuracion | undefined;
  modulos: Modulos;
  integ: ReturnType<typeof integraciones>;
  licencia: Omit<ServicioDeConfiguracion['licencia'], 'listo'>;
  letraPdf: LetraPdf;
  sugerenciasNuevas: number;
  formulario: DatosDelFormulario;
  selectorDeDeposito?: ReactNode;
  grupoInicial?: string | null;
  /** Si la persona administra Mantenimiento: su Excel va en Configuración → Mantenimiento. */
  conExcelDeMantenimiento?: boolean;
  depositoActual?: string | null;
}

// Las acciones del servidor devuelven el error en vez de lanzarlo (Next no deja pasar su texto): acá se lanza, con su código si lo trae.
async function hecho(r: Promise<{ error: string | null; codigo?: string }>) {
  const { error, codigo } = await r;
  if (error) throw Object.assign(new Error(error), { code: codigo });
}

// La misma pantalla de la app de Vite, con el servidor propio. Lo que cambia la configuración, los módulos o los dueños se vuelve a leer del
// servidor (router.refresh): así la cabecera, los menús y las pestañas quedan al día.
export default function ConfiguracionEnNext({ perfil, config, modulos, integ, licencia, letraPdf: letraInicial, sugerenciasNuevas, formulario, selectorDeDeposito, depositoActual, grupoInicial = null, conExcelDeMantenimiento = false }: Props) {
  const router = useRouter();
  const [letraPdf, setLetraPdf] = useState(letraInicial);
  const [nuevas, setNuevas] = useState(sugerenciasNuevas);

  const cambiarLetraPdf = useCallback((l: LetraPdf) => { setLetraPdf(l); void guardarPreferencias({ pdf_letra: l }); }, []);
  const marcarSugerenciasVistas = useCallback(() => { setNuevas(0); void a.marcarSugerenciasVistas(); }, []);
  const FormularioNuevo = useMemo(() => function FormularioNuevo({ open, onClose }: { open: boolean; onClose: () => void }) {
    return <FormularioEnNext open={open} onClose={onClose} item={null} datos={formulario} />;
  }, [formulario]);

  const servicio = useMemo<ServicioDeConfiguracion>(() => {
    const yRedibujar = async (r: Promise<{ error: string | null; codigo?: string }>) => { await hecho(r); router.refresh(); };
    return {
      perfil, config, modulos, integ, selectorDeDeposito, depositoActual, grupoInicial,
      excelDeMantenimiento: conExcelDeMantenimiento ? <ExcelEnNext /> : undefined,
      etiquetasQrDeMantenimiento: conExcelDeMantenimiento ? <EtiquetasQrEnNext /> : undefined,
      avisosDeMantenimiento: conExcelDeMantenimiento ? <AvisosDelEquipo /> : undefined,
      licencia: { ...licencia, listo: true },
      letraPdf, cambiarLetraPdf,
      sugerenciasNuevas: nuevas, marcarSugerenciasVistas,
      registrarError: ACCIONES_DE_MOVIMIENTO.registrarError,
      empresa: { guardar: d => yRedibujar(a.guardarEmpresa(d)) },
      rotulo: {
        guardar: d => yRedibujar(a.guardarDisenoDelRotulo(d)),
        restablecer: () => yRedibujar(a.restablecerDisenoDelRotulo()),
        modelos: a.modelosDeRotulo,
        guardarModelo: m => hecho(a.guardarModeloDeRotulo(m)),
        usarModelo: m => yRedibujar(a.usarModeloDeRotulo(m.id)),
        eliminarModelo: id => hecho(a.eliminarModeloDeRotulo(id)),
      },
      comisionistas: { guardarCampos: campos => yRedibujar(a.guardarCamposDeComisionistas(campos)) },
      definirModulo: (id, apagado) => yRedibujar(a.definirModulo(id, apagado)),
      sectores: {
        leer: a.leerSectores,
        agregar: n => hecho(a.agregarSector(n)),
        renombrar: (id, n) => hecho(a.renombrarSector(id, n)),
        activar: (id, activo) => hecho(a.activarSector(id, activo)),
        eliminar: id => hecho(a.eliminarSector(id)),
      },
      familias: {
        leer: a.leerFamilias,
        renombrarFamilia: (id, n) => yRedibujar(a.renombrarFamilia(id, n)),
        renombrarSubfamilia: (id, n) => yRedibujar(a.renombrarSubfamilia(id, n)),
        planilla: a.planillaDeFamilias,
        datosParaImportar: a.datosDeFamiliasParaImportar,
        importar: lote => yRedibujar(a.importarFamilias(lote)),
        subirPlanilla: archivo => {
          const datos = new FormData();
          datos.set('archivo', archivo, archivo.name);
          return hecho(a.subirPlanillaDeFamilias(datos));
        },
      },
      depositos: {
        leer: a.leerDepositos,
        tope: a.topeDeDepositos,
        crear: d => yRedibujar(a.crearDeposito(d)),
        editar: d => yRedibujar(a.editarDeposito(d)),
        borrar: id => yRedibujar(a.borrarDeposito(id)),
      },
      // la ficha de cada persona, en su página (/configuracion/usuarios/…)
      abrirUsuario: id => router.push(`/configuracion/usuarios/${id ?? 'nuevo'}`),
      usuarios: {
        leer: a.leerUsuarios,
        crear: (input, contrasena) => hecho(a.crearUsuario(input, contrasena)),
        editar: (id, input) => yRedibujar(a.editarUsuario(id, input)),
        activar: (id, activo) => hecho(a.activarUsuario(id, activo)),
        eliminar: id => hecho(a.eliminarUsuario(id)),
        agregarDueno: id => yRedibujar(a.agregarDueno(id)),
        quitarDueno: id => yRedibujar(a.quitarDueno(id)),
        cambiarContrasena: (id, contrasena) => hecho(a.cambiarContrasena(id, contrasena)),
      },
      historial: {
        // las fechas de los filtros se pasan a la hora de quien mira acá, en el navegador
        pagina: (f, despuesDe, limite) => a.paginaDelHistorial(argumentosDelHistorial(f), despuesDe && { momento: despuesDe.momento, id: despuesDe.id }, limite),
        cantidad: (f, tope) => a.cantidadDelHistorial(argumentosDelHistorial(f), tope),
        personas: a.personasDelHistorial,
        depositos: a.depositosDelHistorial,
      },
      errores: { pagina: a.paginaDeErrores, limpiar: () => hecho(a.limpiarErrores()) },
      sugerencias: { pagina: a.paginaDeSugerencias, limpiar: () => hecho(a.limpiarSugerencias()) },
      papelera: {
        leer: a.leerPapelera,
        restaurar: (tipo, id) => hecho(a.restaurarDePapelera(tipo, id)),
        purgar: (tipo, id) => hecho(a.purgarDePapelera(tipo, id)),
      },
      fotosPendientes: {
        leer: a.leerFotosPendientes,
        aprobar: (itemId, slot) => hecho(a.aprobarFotoPendiente(itemId, slot)),
        rechazar: f => hecho(a.rechazarFotoPendiente(f.item_id, f.slot, f.foto_url)),
      },
      repuestos: {
        buscar: buscarParaElegir,
        datosParaImportarStock: a.datosParaImportarStock,
        importarStock: filas => hecho(a.importarStock(filas)),
        FormularioNuevo,
      },
      inicial: {
        conteos: a.conteosIniciales,
        cerrar: async () => { await hecho(a.cerrarConfiguracionInicial()); router.push('/'); },
      },
    };
  }, [perfil, config, modulos, integ, selectorDeDeposito, depositoActual, grupoInicial, conExcelDeMantenimiento, licencia, letraPdf, cambiarLetraPdf, nuevas, marcarSugerenciasVistas, FormularioNuevo, router]);

  return <ContextoDeConfiguracion.Provider value={servicio}><PantallaDeConfiguracion /></ContextoDeConfiguracion.Provider>;
}
