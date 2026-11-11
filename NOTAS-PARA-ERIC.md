# Notas para Eric: módulo de Mantenimiento (etapa 1)

Pantallas hechas con **datos de ejemplo** (no tocan la base). Todo está en `src/features/mantenimiento/`.
Para conectarlo, hay que cambiar el interior de los hooks y borrar `almacenDemo.ts` y `datosDemo.ts`.

## Cómo está enganchado
- `features/mantenimiento/SelectorModulo.tsx`: botón único del encabezado con la sección actual y menú para ir a las otras. Se usa en Directorio, Depósito y Mantenimiento (reemplazó los `Link` sueltos).
- **CAMBIO TEMPORAL:** la base de pruebas no tiene el módulo `mantenimiento` en su plan. Mientras sea demo, la sección se muestra también con solo `deposito` (`features/mantenimiento/visible.ts`, `MODO_DEMO = true`). Al conectar la base y activar el módulo, poner `MODO_DEMO = false`.
- Ruta nueva `/equipos` (`App.tsx`) → `features/mantenimiento/MantenimientoScreen.tsx`.
- Botón "Mantenimiento" en el encabezado y en el menú del celular de Directorio y Depósito (si `modulos.mantenimiento` y el usuario tiene rol de Mantenimiento).
- Mismas puertas que el Depósito: `tieneAccesoMantenimiento(profile)` y el módulo `mantenimiento` activo. No se tocaron licencias, permisos ni tipos de la base.
- Mientras sea demo, guarda en `localStorage` (clave `mantenimiento-demo-v1`) para que no se pierda al recargar. Hay un link "Volver a los datos de ejemplo".

## Cómo quedó enganchado después de tus cambios del 17/10
- Pantalla propia `src/pages/MantenimientoPage.tsx` (reexporta `features/mantenimiento/MantenimientoScreen`), ruta `/mantenimiento` (reemplaza la redirección al Depósito). `/equipos` (la dirección que usó mientras se armaba) redirige a `/mantenimiento`.
- Entrada "Mantenimiento" en el menú de áreas (menú lateral y hamburguesa) de Directorio y Depósito; la pantalla de Mantenimiento usa el mismo `MenuLateral` (Áreas + sus secciones: Equipos, Calendario, Órdenes de trabajo, Excel). Se sacó el botón selector de módulos del encabezado.
- **Roles**: el módulo todavía no tiene roles propios; hoy usa `tieneAccesoDeposito` para entrar e `isDepositoAdmin` para administrar. Hacen falta roles de Mantenimiento (quién crea y asigna OT, quién las ejecuta, quién administra equipos/planillas).
- **Stock**: como el catálogo ya no se descarga entero, `useStockRepuestos` pide a `items` solo los códigos que usa Mantenimiento (`stockDeposito.ts`: `select id, codigo, descripcion, stock, ubicacion ... in('codigo', ...)`), y para elegir un repuesto usa `useRepuestosParaElegir` (búsqueda en la base), en `BuscadorRepuesto.tsx`. Conviene guardar `item_id` en las líneas de repuestos en lugar del código.

## Hooks a reemplazar (misma forma de respuesta: `{ data, isLoading, isError }` y `{ mutateAsync, isPending }`)
- `useEquipos.ts`: `useEquiposQuery`, `useIntervencionesQuery`, `useRepuestosCriticosQuery`, `useManualesQuery`, `useFichaEquipo(id)`, `useGuardarEquipo` (devuelve el id), `useEliminarEquipo` (borra todo lo del equipo), `useRegistrarIntervencion`, `useEliminarIntervencion`, `useGuardarRepuestoCritico`, `useQuitarRepuestoCritico`, `useAgregarManual` (hoy usa `URL.createObjectURL`; hay que subir al almacenamiento), `useQuitarManual`, `usePersonasSugeridas` (convendría sugerir los usuarios con rol de Mantenimiento).
- `usePreventivo.ts`: `useRutinasQuery`, `useOrdenesQuery`, `useGuardarRutina`, `useEliminarRutina`, `useCrearOrdenCorrectiva` (devuelve el número de OT; recibe repuestos, prioridad y falla), `useGuardarRepuestosOrden`, `useGuardarDetalleCorrectivo`, `useCambiarEstadoOrden`, `useCerrarOrden` (descuenta stock), `useReprogramarOrden`, `useEliminarOrden`.
- `useEquipos.ts` también: `useComponentesDeEquipo(id)` (sugerencias de componente: sub-equipos + componentes ya usados) y `useRegistrarIntervencion({ …, descontarStock })`.
- `useExcelMantenimiento.ts`: `analizarArchivoMantenimiento` (necesita los datos actuales) y `useAplicarImportacion` (ideal: una sola operación en la base).
- `useStockRepuestos.ts` ya usa la tabla real `items` (solo lectura, cruza por `codigo`). En modo de ejemplo le resta los `consumos` guardados en Mantenimiento (no toca el Depósito). Con la base: `stock = item.stock` y listo. `useFaltantes()` dice qué líneas de una OT no tienen stock (suma el mismo código en varios renglones).

## Tablas que harían falta (propuesta; tipos en `tipos.ts`)
- **equipo_sectores**: id, nombre, padre_id (null = sector; si no, es sub-sector de ese sector; solo dos niveles). Único por empresa y padre, sin importar mayúsculas/tildes. Orden por importancia: columna `orden` (int) en los sectores; hoy `ordenSectores: string[]` en los datos y `useMoverSector`. Hooks nuevos: `useCrearSubsector`, `useRenombrarSubsector`, `useEliminarSubsector`; `useSectoresMantenimiento` devuelve cada sector con sus sub-sectores y cantidades. Excel: columnas Sector y Subsector en Equipos, y hoja Sectores. Hoy el sector es texto en el equipo; con tabla, renombrar o juntar es cambiar el sector_id. Hooks: `useSectoresMantenimiento`, `useCrearSector`, `useRenombrarSector`, `useEliminarSector` (en `useEquipos.ts`).
- **equipos**: id, codigo (único por empresa), nombre, sector (texto), etiquetas (text[]), marca, modelo, numero_serie, ubicacion, critico (bool), notas, timestamps. *La tabla `equipos` actual (nombre, sector, datos_tecnicos, manual_url) se reemplaza o amplía.*
- **equipos.padre_id** (null = principal; FK a equipos). Un solo nivel: un sub-equipo no puede tener hijos (validar en la base). Borrar un principal borra sus sub-equipos. `useDuplicarEquipo` copia equipo + sub-equipos + repuestos críticos (+ rutinas opcional): ideal como una función de la base, en una sola transacción. Excel: columna "Pertenece a" (código del principal).
- **equipo_intervenciones** (historial): id, equipo_id, fecha (date), tipo ('correctivo' | 'preventivo'), descripcion, realizado_por, horas (numeric null), repuestos_usados (texto libre, registros viejos/Excel), ot_id (null), ot_numero (texto, para que quede aunque se borre la OT), tareas (jsonb `[{texto, hecha}]`), + columnas de correctivo (ver abajo), creado_por, timestamps.
- **Repuestos por componente** (`RepuestoLinea`): una tabla `mantenimiento_repuestos` (id, item_id → items o codigo + descripcion si no está en el Depósito, componente (texto), cantidad (prevista), usado (null mientras está abierta), y a qué pertenece: rutina_id | ot_id | intervencion_id). Las rutinas copian sus líneas a cada OT que generan.
- **Detalle de correctivo** (`DetalleCorrectivo`) en `ordenes_trabajo` y `equipo_intervenciones`: prioridad ('urgente' | 'normal'), falla, causa, solucion, horas_parada (numeric null). Null en las preventivas.
- **Descuento de stock**: al terminar una OT (`useCerrarOrden`) o al registrar un mantenimiento con "Descontarlos del stock", cada línea con código y `usado > 0` es un **retiro real del Depósito** (el mismo movimiento que usa el Depósito), con motivo "OT-0012 · BC-01 Bomba centrífuga" y referencia a la intervención. Hoy se guardan como `consumos` (tipo `ConsumoStock`) solo para simular. Lo que no se usó (0) no se descuenta. Definir qué pasa si el stock queda negativo (hoy la OT se cierra igual: el encargado pidió no frenar el trabajo). Al borrar un registro del historial el stock NO vuelve solo.
- **equipo_repuestos_criticos**: id, equipo_id, codigo (del repuesto; se podría pasar a item_id → items), descripcion, cantidad, nota. Único (equipo_id, codigo). *Hoy existe `equipo_items`: ver si sirve.*
- **equipo_manuales**: id, equipo_id, nombre, ruta en el almacenamiento, tamanio_bytes, subido_el, subido_por.
- **rutinas_preventivas**: id, equipo_id, tarea, frecuencia_dias (int > 0), proxima_fecha (date), aviso_dias_antes (int ≥ 0), responsable, activa.
- **ordenes_trabajo**: id, numero (correlativo OT-0001 por empresa), tipo ('preventiva' | 'correctiva'), equipo_id, rutina_id (null), fecha_programada, tareas (texto, una tarea por renglón), tareas_hechas (boolean[], una marca por renglón; alternativa: tabla ot_tareas con texto/hecha/orden), asignado_a, estado ('pendiente' | 'en_curso' | 'terminada'), fecha_cierre, observaciones, horas, repuestos_usados, + líneas de repuestos y columnas de correctivo.
- **Aviso de falta de repuesto**: una OT abierta cuyo repuesto no tiene stock suficiente se marca "Falta repuesto" (lista, calendario, ficha, aviso arriba con filtro en Órdenes). La OT se crea igual siempre.

## Planillas de tareas y mediciones
- **planillas_tareas** (id, nombre único por empresa, notas) + **planilla_tareas_items** (planilla_id, orden, texto, unidad, minimo, maximo; sin unidad ni rango = tarea para tildar). Hooks: `usePlanillasQuery`, `useGuardarPlanilla`, `useEliminarPlanilla` (las rutinas que la usaban se quedan con una copia).
- **rutinas_preventivas** += planilla_id (null = tareas propias) y mediciones (jsonb, una por renglón de `tarea`: `{unidad, minimo, maximo}` o null). Si tiene planilla, sus tareas y mediciones salen de la planilla (`aplicarPlanillas` en `preventivo.ts`): al cambiar la planilla se actualizan todas sus rutinas y las OT pendientes. Conviene hacerlo en la base (trigger al guardar la planilla).
- **ordenes_trabajo** += mediciones (copiadas de la rutina) y valores (numeric[], uno por tarea). `useAnotarValor` guarda un valor y tilda la tarea. Si cambian las tareas, marcas y valores se borran.
- Historial: cada tarea registrada guarda `{texto, hecha, medicion?, valor?}` (para la sección "Mediciones" del equipo: últimos valores y gráfico). Conviene una tabla `mediciones` (equipo_id, fecha, tarea, valor, unidad, minimo, maximo, intervencion_id) para consultar tendencias rápido.
- Al terminar: si hay valores fuera de rango, se ofrece crear una OT correctiva ("Buscar la causa — …" + "Después de corregir: volver a medir"). `useCerrarOrden` devuelve `{ pendientes, valores }` con los números de OT creadas.
- Al tildar la última tarea (o anotar el último valor) se abre el cierre ya completo; solo hay que confirmar.
- PDF: `generarPlanillaPdf` (planilla en blanco para imprimir) y la OT con casillero "Valor" + unidad + rango; si está terminada, marca FUERA DE RANGO.
- Excel: hoja "Planillas de tareas" (Planilla, Tarea, Unidad, Mínimo, Máximo; si la planilla existe se reemplazan sus tareas), columna "Planilla" en Rutinas y "Mediciones" en Historial.

## Técnicos, liberación del equipo y formato de la OT
- **Técnicos por OT** (`TrabajoTecnico`): tabla `ot_tecnicos` (ot_id / intervencion_id, nombre o usuario_id, fecha de término, hora_inicio, hora_fin). Las horas hombre se calculan (`horasDeTecnico`, cruza medianoche); `horas` de la OT = suma (`totalHorasHombre`). `realizado_por` = los nombres juntos.
- **Liberación del equipo** (`Liberacion`): jsonb en la OT y en la intervención: `{ controles: [{texto, ok}], recibio }`. Los controles salen de la configuración de la empresa en el momento de cerrar (si después cambian, lo guardado no cambia).
- **Configuración del módulo** (`ConfigMantenimiento`, una por empresa, solo admin): código/versión/vigencia del registro de calidad (encabezado de la OT impresa), controles de liberación (lista; vacía = sin liberación) y quién recibe el equipo. Hooks `useConfigMantenimiento` y `useGuardarConfigMantenimiento`; pantalla "Formato de la OT" en Órdenes de trabajo.
- PDF: encabezado con recuadro del registro, Equipo / Sub-equipo (si la OT es de un sub-equipo, sale su principal como Equipo), tabla de técnicos con firma y bloque de liberación con casilleros y firma de quien recibe.

## Regla del preventivo (está en `preventivo.ts`, con pruebas)
- Cada rutina activa tiene **siempre una OT preventiva abierta** para su `proxima_fecha`. Si la rutina cambia, su OT pendiente se actualiza; si se desactiva o borra, la OT pendiente se quita (una empezada no).
- Las tareas se tildan mientras la OT está abierta (`useMarcarTareas`). Si cambian las tareas de la rutina, la OT pendiente pierde las marcas.
- Al terminar una OT: queda `terminada` con sus marcas, se agrega una intervención al historial ("8 de 10 tareas hechas. Hechas: … Sin hacer: …") y la rutina pasa a `fecha_cierre + frecuencia_dias`; se genera la OT siguiente. Opcional: las tareas sin hacer pasan a una OT correctiva nueva para el día siguiente.
- PDF de la OT: `otPdf.ts` (jsPDF, ya instalado); `useImprimirOrdenes` lo arma con el nombre y logo de la empresa.
- Conviene hacer esto del lado del servidor (función/trigger al guardar una rutina y al cerrar una OT), no en el navegador.
- Estado del aviso: vencida (fecha < hoy), por vencer (faltan ≤ aviso_dias_antes), programada, terminada.

## Permisos (lo que hoy muestran las pantallas)
- Ver todo: cualquier usuario con rol de Mantenimiento.
- Admin de Mantenimiento (y dueño): crear/editar/borrar equipos, repuestos críticos, manuales y rutinas; borrar historial y OT correctivas; importar Excel.
- Usuario de Mantenimiento: registrar y editar historial, crear OT correctivas, empezar/terminar/mover OT.

## Opciones configurables a futuro
- Contar la próxima fecha desde el día en que se hizo (actual) o desde la fecha planificada.
- Días de aviso por defecto para OT correctivas (hoy 3).
- Avisos por correo/celular al asignar o al vencer una OT.
- Rutinas por horas de uso, además de calendario.

## Menú por sectores, Inicio con disponibilidad y costos por equipo (06/11/2026)
- **Menú lateral**: debajo de las secciones del módulo van los sectores (en el orden de importancia de la empresa); los que tienen sub-sectores se despliegan. Elegir uno abre la lista de sus equipos (`EquiposScreen` con `fijo`). `MenuLateral` y `MobileMenu` aceptan ahora sub-menús (`hijos` / `sub`, `desplegable`), opcionales: el resto de las pantallas no cambia.
- **El equipo se abre como pantalla** (`FichaEquipoPantalla`), no como ventana, con "Volver" a donde se estaba.
- **Inicio** (`InicioScreen.tsx`, cálculo en `disponibilidad.ts` con pruebas): disponibilidad = (24 h × días del período − horas paradas) / (24 h × días), por equipo principal (las paradas de un sub-equipo cuentan en su principal), por sector y en general. Por ahora solo paradas por mantenimiento: `correctivo.horas_parada` y la nueva **`horas_parada` de los preventivos** (columna nueva en OT e intervenciones; en las correctivas sigue en el detalle del correctivo). A futuro: paradas por producción y por fin de producción (tabla de paradas con motivo, desde/hasta).
- **Costos** (`CostosEquipo.tsx`, cálculo en `costos.ts` con pruebas), en la solapa Datos del equipo (suma sus sub-equipos):
  - Repuestos: cantidad usada × **`precio`** por unidad, columna nueva en cada renglón de repuestos de la OT / intervención. Se anota al terminar la OT o al registrar un mantenimiento y queda con el precio de ese día.
  - Mano de obra: horas de trabajo de cada intervención × **`costo_hora`** (uno solo por empresa, en la configuración del módulo).
  - Servicios externos: tabla nueva **`gastos_externos`** (id, equipo_id, fecha, proveedor, descripcion, monto). Se cargan directo en el equipo.
- Permisos que muestran hoy las pantallas: todos los de Mantenimiento ven los costos; cargar o borrar gastos externos y cambiar el valor de la hora, solo el admin de Mantenimiento. Los precios de repuestos los anota quien termina la OT.
- Pendiente: los gastos externos y los precios todavía no van en el Excel (exportar/importar).

## Circuito de las OT y roles de Mantenimiento (10/11/2026)
- **Roles nuevos del módulo** (no son los del Depósito): `responsable` (deriva las preventivas, aprueba, administra equipos/rutinas/planillas/formato), `jefe` (asigna a técnicos, revisa o devuelve), `tecnico` (ve "Mis OT", las completa con su usuario, carga correctivas de guardia). Hoy se simulan con "Ver como" (`usuarioMantenimiento.ts`, `personas` en los datos de ejemplo); con la base salen del usuario logueado. `esAdmin` del módulo = admin de Depósito **y** responsable (hasta que existan los roles).
- **OT, columnas nuevas** (`tipos.ts`): `etapa` (`por_derivar` → `por_asignar` → `asignada` → `a_revisar` → `para_aprobar` → `aprobada`), `asignados` (ids de técnicos; conviene tabla `ot_asignados`), `pasos` (recorrido: cuándo, quién, acción, comentario; conviene tabla `ot_pasos`), `terminada_en` (fecha y hora), `cierre` (lo que cargó el técnico, jsonb, hasta que se aprueba).
- **Al terminar** (`terminarOrden`): la OT queda `a_revisar` y la rutina pasa a la fecha siguiente; **no** va al historial ni descuenta stock. **Al aprobar** (`aprobarOrden`): se crea la intervención (con `revisado_por` y `aprobado_por`), los retiros de stock y, si corresponde, las OT nuevas con lo pendiente / valores fuera de rango (etapa `por_asignar`). Conviene que cada paso lo valide la base según el rol.
- **Correctiva cargada por el técnico** (`armarCorrectivaCargada`): se crea ya terminada (`a_revisar`), **sin lista de tareas** (`tareas` vacío): el texto del técnico va en `correctivo.solucion` ("Trabajo realizado") y lo pendiente en `observaciones`. Al aprobar, `aprobarOrden` acepta `tareasNuevas` (texto, una tarea por renglón) que escribe el responsable y con eso crea la OT con lo pendiente (`por_asignar`). En las preventivas las marcas siguen siendo `tareas_hechas` (en pantalla OK / NO). Ya no existe la OT correctiva "a programar" creada a mano.
- **Horario de recepción** (`config.horario_recepcion`: una franja por día de la semana, `{ dia, desde, hasta }`; de fábrica lunes a viernes 8:30–17 y sábados 8:30–12): las OT terminadas les aparecen al jefe y al responsable solo desde `llegaEn(terminada_en)` (`flujo.ts`, con pruebas). Los avisos al celular o al mail (a futuro) tienen que respetar ese horario: conviene una tarea programada en el servidor que mande el resumen al abrir el horario.
- Hooks nuevos (`usePreventivo.ts`): `useDerivarOrdenes`, `useAsignarOrden`, `useTerminarOrden`, `usePasarAAprobacion`, `useDevolverOrden`, `useAprobarOrden`, `useCargarCorrectiva` (reemplazan a `useCerrarOrden` y `useCrearOrdenCorrectiva`).

