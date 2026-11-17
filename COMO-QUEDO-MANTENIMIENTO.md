# Mantenimiento

El módulo lo diseñó el encargado de mantenimiento con el socio, en su propio repositorio (`coppolamartin/cremac`, con datos de ejemplo:
sus `DECISIONES.md` y `NOTAS-PARA-ERIC.md` explican el porqué de cada pantalla). Acá se trae a la app de verdad, **por etapas**: cada una se
publica y se prueba antes de la siguiente.

| Etapa | Qué trae | Estado |
|---|---|---|
| 1 | Equipos y sub-equipos, sectores y sub-sectores, buscador, QR, ficha (datos, historial, repuestos críticos, manuales) y los 3 roles; adelantado de la 3: importar y exportar Excel (sectores, equipos, historial, repuestos críticos) | hecha |
| 2 | Rutinas preventivas, calendario con avisos, órdenes de trabajo (preventivas y correctivas), "mis OT", cierre con descuento de stock, OT en PDF | hecha |
| 3 | Planillas de tareas con mediciones y gráfico, liberación del equipo, formato de la OT configurable; el Excel suma sus hojas (planillas, rutinas, órdenes) | pendiente |

**Excel** (Mantenimiento → Excel, solo administradores): mismas hojas y columnas que el "Exportar a Excel" de la versión de ejemplo del socio,
así lo que él cargó entra tal cual. Vista previa con lo nuevo, lo que cambia y los errores por fila; se guarda todo junto o nada. Los técnicos
del historial se vinculan al usuario si el nombre coincide (si no, queda el nombre escrito); los repuestos críticos tienen que estar en el
Depósito; las hojas de otras etapas se avisan y no se cargan.

## Decisiones (con el dueño, 04/11/2026)

1. **Si al cerrar una OT el stock no alcanza**, la OT se cierra igual, se descuenta lo que haya y la diferencia queda como aviso para el
   Depósito ("faltó descontar…"). El stock nunca queda negativo. (Etapa 2.)
2. **Roles propios de Mantenimiento** (no los del Depósito), en `usuarios_perfil.rol_equipos` (`mantenimiento_rol`, por un nombre viejo, es
   el del Depósito):
   - **Administrador**: equipos, sectores, repuestos críticos, manuales; borra el historial.
   - **Técnico**: ve todo y registra (y corrige) los trabajos.
   - **Solo consulta** (por ejemplo, Producción): ve fichas, manuales, historial y lo programado, sin cambiar nada.
   - Sin rol, no ve Mantenimiento. El dueño puede todo. Alguien puede tener solo Mantenimiento (sin Directorio ni Depósito).
3. **Los técnicos de un trabajo se eligen de los usuarios** con rol de técnico o administrador (no se escriben a mano). Más adelante:
   permisos que se le dan a un técnico en particular.
4. **Tres etapas**, en ese orden.
5. **El socio sigue diseñando en una copia de la app nueva**, con datos inventados (se arma después de la etapa 1).

## Cómo quedó la etapa 1 (y en qué se aparta del diseño del socio)

- Área propia en `/mantenimiento/equipos` (`/mantenimiento` a secas lleva ahí: antes llevaba al Depósito con un desvío permanente que los
  navegadores recuerdan). Cabecera verde, como la diseñó el socio.
- **Base** (`supabase/componentes/base/…003800_rol_de_mantenimiento.sql` y `mantenimiento/…003800_equipos_y_su_ficha.sql`):
  `equipo_sectores` (dos niveles, ordenados por importancia), `equipos` ampliada (código único por empresa, sector, sub-equipo de un solo
  nivel, etiquetas, marca, modelo, serie, ubicación, crítico, notas), `equipo_items` (repuestos críticos, con cantidad y nota),
  `equipo_manuales`, `equipo_intervenciones` (historial) e `intervencion_tecnicos`. Lo que ya había en `equipos` se conservó (el sector pasó
  a ser un sector, los datos técnicos y el manual a las notas, y cada uno recibió un código EQ-001…).
- **El buscador** es el del socio (`src/features/mantenimiento/buscador.ts`), pero corre en el servidor: la base trae solo el historial que
  tiene alguna de las palabras, así no se descarga todo el historial al navegador.
- **Repuestos críticos**: solo repuestos del Depósito (el socio dejaba escribirlos a mano). Si no está en el Depósito, se carga primero allá:
  así se ve su stock y el aviso de "falta". Quien solo consulta (sin acceso al Depósito) igual ve el stock, por una función de la base.
- **Historial**: los repuestos usados van escritos; las líneas que descuentan stock llegan con la etapa 2 (es el mismo descuento que el
  cierre de una OT).
- **Manuales**: PDF de hasta 200 MB (Nginx deja pasar ese tamaño solo en /mantenimiento/manuales; se guardan a medida que llegan y se
  reacomodan con qpdf para verlos por partes: se sirven con Range, la primera página aparece enseguida), en una carpeta privada (`manuales`, en `/srv/archivos`): solo los abre quien ve
  Mantenimiento (`/mantenimiento/manuales/<id>`). **Ojo:** como las fotos, todavía no se copian fuera del servidor (pendiente del respaldo).
- **QR**: lleva el código del equipo (como los repuestos). Se lee con el botón de la cámara de Mantenimiento.

## Cómo quedó la etapa 2

- **Base** (`mantenimiento/…003900_preventivo_y_ordenes_de_trabajo.sql` y `abastecimiento/…003900_movimiento_de_mantenimiento.sql`):
  `rutinas_preventivas` (con `rutina_tareas` y `rutina_repuestos`), `ordenes_trabajo` (con `ot_tareas`, `ot_repuestos` y `ot_tecnicos`). Las tareas
  y los repuestos van en tablas propias (el socio usaba un texto con listas paralelas: editar una tarea corría las marcas de las otras).
- **La OT de cada rutina la arma la base** (`sincronizar_rutina`), al guardar la rutina y al terminar la OT anterior: no depende de que alguien
  abra la pantalla. Terminar una OT es una sola función (`cerrar_ot`), todo junto o nada: historial, técnicos con horario, descuento de stock,
  la siguiente de la rutina (contada desde el día en que se hizo) y, si se pide, una OT con lo que quedó sin hacer. Una OT terminada ya no se cambia.
- **Stock** (decisión 1): se descuenta solo lo que se usó, con un movimiento "Mantenimiento" (OT y equipo) en la ficha de stock del artículo. Si no
  alcanza, se descuenta lo que hay y la diferencia queda en `ot_repuestos.faltante`: el Depósito la ve en "Para atender" (quien tiene ese
  depósito) y quien lo administra la da por revisada. El descuento lo hace un disparador (como los retiros), así lo puede hacer un técnico que no
  administra el Depósito.
- **Pantallas**: Calendario (avisos, el mes, el día elegido y las rutinas; el número del menú son las OT vencidas o por vencer), Órdenes de
  trabajo (un técnico arranca en "Mis OT") y la solapa "Preventivo" en la ficha de cada equipo. "Empezar" anota la hora, que se usa de inicio al
  terminar. La OT se imprime en PDF (una o todas las del día o de la lista).
- **Se aparta del socio**: los técnicos y el responsable se eligen de los usuarios de Mantenimiento (decisión 3); el registro de calidad
  configurable, la liberación del equipo y las mediciones llegaron con la etapa 3.

## Cómo quedó la etapa 3

- **Base** (`mantenimiento/…004000_planillas_mediciones_y_formato.sql`): `planillas_tareas` (con `planilla_tareas_items`), las mediciones en
  las tareas de planillas, rutinas y OT (`mide`, `unidad`, `minimo`, `maximo`; en la OT, también `valor`), `rutinas_preventivas.planilla_id`,
  `ordenes_trabajo.liberacion` y `mantenimiento_config` (el formato de la OT, una fila por empresa). Ver y usar: todos los de Mantenimiento;
  cambiar planillas y formato: quien administra.
- **Planillas**: una rutina toma sus tareas de una planilla o las tiene propias. Al guardar una planilla, `aplicar_planilla` pone al día las
  rutinas que la usan y sus OT pendientes (si las tareas no cambiaron, las marcas y los valores ya anotados se conservan). Si se borra la
  planilla, las rutinas se quedan con una copia de sus tareas. Cada planilla se imprime en blanco para llevarla a cualquier equipo.
- **Mediciones**: en la OT, cada tarea con medición tiene su casillero; el valor se guarda al salir del campo y avisa si queda fuera del rango
  normal. Al terminar, los valores fuera de rango quedan en el historial ("Fuera de rango: …") y, si se pide, en una OT correctiva para el día
  siguiente con "Buscar la causa — …" y "Después de corregir: …" (que vuelve a pedir el valor). En la ficha, en Historial, la sección
  "Mediciones" muestra el último valor de cada una, la línea de cómo vienen y los últimos 8.
- **Liberación del equipo**: al terminar, los controles de entrega del formato de la OT (se tildan) y quién recibió el equipo; queda en la OT y
  sale en el PDF con lugar para la firma. Sin controles en el formato, la OT no tiene liberación.
- **Formato de la OT** (Órdenes de trabajo → "Formato de la OT", quien administra): código, versión y vigencia del registro de calidad (recuadro
  arriba a la derecha de la OT impresa), los controles de la liberación y quién recibe el equipo. De fábrica, sin registro y con los cinco
  controles del socio.
- **Excel**: se cargan también las hojas "Planillas de tareas" (una fila por tarea; con unidad, mínimo o máximo es una medición) y "Rutinas
  preventivas" (con planilla, o con sus tareas en "Tarea", una por renglón). Una rutina se reconoce por equipo y planilla (o equipo y tareas):
  volver a importar el mismo archivo no la duplica. Si el responsable no es un usuario de Mantenimiento, la rutina queda sin responsable y la
  vista previa lo avisa. Se exportan además las planillas, las rutinas y las órdenes de trabajo (con sus mediciones y su liberación).
- **Se aparta del socio**: la columna "Repuestos" de las rutinas es solo para leer (como en su versión); el formato vale para toda la empresa.

## Lo que trajo el socio el 11/11/2026 (su repositorio de pantallas, "modificaciones varias")

- **Inicio** (`/mantenimiento/inicio`, la primera sección): la disponibilidad de los equipos (24 h por día menos las horas paradas por
  mantenimiento, correctivo y preventivo por separado), en general, por sector y los equipos con más horas parados; por período. Las horas de
  equipo parado se anotan ahora también en los preventivos (al terminar la OT o al registrar un mantenimiento). Cálculo en
  `src/features/mantenimiento/disponibilidad.ts`; las paradas del período las trae `paradasDeEquipos`.
- **Costos por equipo** (solapa Datos de la ficha, con sus sub-equipos): repuestos usados × el precio anotado al terminar la OT
  (`ot_repuestos.precio`), horas × un valor de hora único (`mantenimiento_config.costo_hora`) y servicios externos (`equipo_gastos_externos`,
  los carga quien administra). Cálculo en `costos.ts`.
- **El circuito de las OT** (`mantenimiento/…004500_circuito_de_las_ot_y_costos.sql`): `ordenes_trabajo.etapa` (por_derivar → por_asignar →
  asignada → a_revisar → para_aprobar → aprobada), `ot_asignados` (varios técnicos), `ot_pasos` (el recorrido) y una función por paso
  (`derivar_ots`, `asignar_ot`, `terminar_ot`, `pasar_ot_a_aprobacion`, `devolver_ot`, `aprobar_ot`, `cargar_ot_correctiva`). Terminar = lo que
  cargó el técnico queda en la OT y la rutina pasa a su fecha siguiente; aprobar = historial, descuento de stock y OT nuevas (lo que quedó en NO,
  lo que escribe el responsable, los valores fuera de rango). La etapa solo cambia con esas funciones. Las preventivas: OK / NO; las
  correctivas, sin casilleros: "Trabajo realizado" y lo pendiente en observaciones. Prueba de punta a punta: `scripts/pruebas/esquema/circuito-ot.mjs`.
- **Roles**: se suma "Jefe de taller" (`rol_equipos = 'jefe'`, `jefe_de_taller()`). El "Administrador" de siempre es el responsable de
  mantenimiento. No se quitó ningún rol (solo consulta sigue).
- **Horario de recepción** (en Formato de la OT): las OT terminadas les aparecen al jefe y al responsable solo dentro del horario; las de afuera,
  al abrir el próximo día con recepción (`flujo.ts`, lo filtra la pantalla). Los avisos al celular, cuando se hagan, tienen que respetarlo.
- **Calendario**: al tocar un día se abre una ventana con todas sus OT (color, etapa, Ver OT) y los botones Derivar las del día e Imprimir.
- **Se aparta del socio** (para no borrar nada): sigue la correctiva "programada" (para el jefe o el responsable, nace para asignar o asignada) al
  lado de "Cargar OT correctiva" (la del técnico, ya hecha); el responsable y el dueño también pueden asignar y revisar (si todavía no hay jefe,
  nada se traba); los dueños pueden figurar como técnicos. Las OT que ya existían: las terminadas quedaron "aprobadas" y las abiertas, asignadas
  a quien las tenía. "Ver como" (personas inventadas) no hace falta: el perfil sale del usuario.
- **Menú por sectores** (también en el celular): debajo de las secciones van los sectores, en el orden de importancia; cada uno abre
  `/mantenimiento/sector/<id>` con solo sus equipos; los que tienen sub-sectores se despliegan (de a uno por vez, como pidió el dueño), con
  un "Todo <sector>" además de cada sub-sector. La pantalla con todos los equipos queda como "Buscar equipo" (buscador y QR).
- **El equipo se abre como pantalla** (`FichaEquipoPantalla`), no como ventana, con "Volver" (a la lista, al equipo principal o a la página
  de donde se vino). Arriba, un aviso verde con lo que la persona tiene que hacer con las OT; el técnico ve "Mis OT" con su número.
- **Pendiente**: los gastos externos y los precios todavía no van en el Excel.

## Avisos al celular (pedido del dueño, 12/11/2026)

- **Qué avisa:** al técnico, cuando le asignan o le devuelven una OT; al jefe de taller, cuando le derivan OT para asignar y cuando un técnico termina una (dentro del horario de recepción); al responsable y al dueño, cuando el jefe revisó una OT (para aprobar) y un resumen a la mañana (al abrir el horario de recepción) de las preventivas para derivar, vencidas o por vencer. Sin jefe de taller, lo del jefe le llega al responsable. Nunca se avisa a quien hizo el paso.
- **Cómo:** los avisos de los propios navegadores ("web push"), gratis. La base anota qué avisar (`supabase/componentes/mantenimiento/20260101004700_avisos_al_celular.sql`); el servidor los manda cada minuto (`web/src/lib/avisosAlCelular.ts`, funciones en `web/db/05-avisos.sql`). Antes de mandar se fija que el aviso siga valiendo (si la OT ya avanzó, no va) y junta los del mismo tipo para la misma persona en uno. Al tocarlo se abre la OT (`web/public/sw.js`).
- **Activarlos:** vienen prendidos para todos, pero el teléfono pide que la persona toque "Permitir" una vez: al entrar le aparece un cartel (si lo cierra, vuelve a los 3 días). En el iPhone hace falta agregar la app a la pantalla de inicio (la app ahora es instalable: `web/src/app/manifest.ts`). Al activarlos llega un aviso de prueba.
- **Por persona:** Configuración → Mantenimiento → Avisos (el dueño y el responsable): quién los activó en su celular, prender o apagar cada aviso por persona y mandar uno de prueba.
- **Claves del servidor (VAPID):** se crean solas la primera vez y quedan en la base (`servidor.avisos_claves`). Si se pierden, cada celular vuelve a anotarse solo la próxima vez que abre la app.
