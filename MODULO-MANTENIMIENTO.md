# Módulo de Mantenimiento: contexto, punto de partida y forma de trabajar

> Este archivo **no es una especificación cerrada**. Es el punto de partida. Quien diseña el módulo es el **encargado de mantenimiento**, que conoce el trabajo real; vos lo ayudás a ponerlo en palabras, en pantallas y después en código.
> Si algo de lo que figura acá no coincide con cómo se trabaja de verdad, **gana lo que diga el encargado**: se cambia este archivo (con su aprobación) y se sigue.

## 1. Qué producto es esto (importante para decidir bien)
"Gestión empresarial" es un **sistema para empresas**, que se instala por separado en cada cliente. **No es un sistema a medida de una sola fábrica.** El primer cliente es una planta de **alimentos / lácteos**, pero el módulo tiene que servir también para **metalúrgicas, plantas de plásticos y packaging, agroindustria y otras plantas de proceso**. Más adelante podrían venir flotas de vehículos o edificios, pero **todavía no se construye nada para eso**: solo se evita cerrarle la puerta.
No es para talleres que reparan cosas de terceros.

Consecuencias en cómo se diseña:
- **Palabras neutras y cambiables.** No uses términos propios de una fábrica en lugares fijos de la pantalla. Los nombres de los niveles (sector, subsector, equipo) deberían poder cambiarse por empresa.
- **Lo que una empresa decide distinto de otra es una opción, no una regla fija.** Cuando dudes entre dos formas de hacer algo, preguntale al encargado cuál es la suya y proponé que sea una **opción configurable** con un valor por defecto razonable.
- **Campos propios por tipo de equipo** (una bomba tiene presión y caudal; un horno, temperatura): pensalos como algo que cada empresa puede ampliar.
- Los datos de ejemplo que uses para armar pantallas tienen que ser **inventados y genéricos** (nada de nombres reales de la fábrica, proveedores, personas ni equipos).

## 2. Punto de partida (ideas ya conversadas; el encargado puede cambiarlas)

**Estructura:** `Sector → Subsector (opcional) → Equipo`. Dos niveles de agrupación, fijos; un sector puede tener subsectores o tener los equipos directamente. No es un árbol de profundidad libre.

**Cada equipo tiene:**
- **Manuales y documentos en PDF.**
- **Repuestos** asociados, con los **más usados** destacados.
- **Historial de mantenimiento.**
- **Un código QR** que, al escanearse, abre la ficha completa del equipo (incluidos los manuales).

**Órdenes de trabajo (OT):**
- Las crean los **administradores de Mantenimiento** y se las asignan a **usuarios de mantenimiento**. Indican el **día**, el **equipo**, las **tareas a realizar** y, opcionalmente, los **repuestos**.
- Cada usuario de mantenimiento ve **sus** OT en su perfil, con un botón para **empezar el trabajo** (así se calcula el tiempo).
- Puede **agregar colaboradores** (si lo hizo con otra persona). En una OT de a dos, **con que uno la inicie y la frene, el tiempo queda igual en el perfil de los dos**.

**Mantenimiento preventivo:** las **rutinas** ("engrasar la cinta cada 7 días", "cambiar filtros cada 500 horas") **generan las OT solas**. Las pantallas de las rutinas pueden llegar en una segunda etapa, pero **lo que se diseñe antes tiene que dejarles lugar**.

**Qué se busca en la experiencia:** algo **dinámico**, no "una carpeta dentro de otra y tablas de Excel". Se llega a un equipo **buscando o escaneando un QR**, no navegando carpetas. Pensado **primero para el celular** (el técnico está junto a la máquina).

## 3. Lo que está abierto (resolverlo con el encargado, no suponer)
1. ¿Cómo se cuenta el tiempo cuando trabajan dos personas juntas: **1 hora de reloj** o **2 horas-hombre**? (probablemente conviene mostrar las dos, y que la empresa elija cuál usar para sus informes).
2. Al finalizar una OT, los repuestos usados: ¿**descuentan stock** del Depósito o solo se anotan?
3. **Tipos de OT** (preventiva, correctiva, de emergencia…): ¿una lista editable o una sola clase?
4. ¿Quién puede ver los **manuales**: solo mantenimiento o todos?
5. ¿Hace falta **avisarle** al técnico cuando le asignan una OT?
6. "Frenar": ¿es **pausar** (se retoma) o **terminar**? (se proponen los dos botones).
7. ¿Qué pasa si un técnico **se olvida de parar** el cronómetro?
8. Las **rutinas preventivas**: ¿se disparan solo por **calendario** (cada X días) o también por **horas de uso** de la máquina?
9. ¿Los **sectores** de Mantenimiento son los mismos que los del Depósito (los que se eligen al retirar un repuesto) o son aparte? (propuesta de arranque: estructura propia, conectable con el Depósito por opción).
10. **Informes** que quiere la gerencia (horas por equipo, paradas, repuestos más usados, OT vencidas…).

## 4. Cómo se trabaja: siempre en este orden

### Paso 0 · Mirar lo que ya existe (solo lectura)
El encargado tiene hoy carpetas con manuales en PDF y planillas de Excel. **Antes de preguntar nada**, mirá cómo están organizadas:
1. Pediles la ubicación de esas carpetas. Quedan **donde están, fuera de este repositorio**. Si Claude Code te pide permiso para leer fuera del repo, pedíselo a la persona.
2. **Solo leer. Nunca modifiques, muevas, renombres ni borres nada** de esas carpetas.
3. Empezá por la **estructura**: nombres de carpetas y subcarpetas, tipos de archivo, cuántos hay. Después, los **encabezados y hojas** de las planillas de Excel (la librería `xlsx` ya está instalada en este proyecto). Recién después, algunos PDF.
4. **Antes de abrir cualquier planilla o PDF a fondo, decí qué es y esperá el visto bueno.** Los manuales pueden ser muy pesados. No leas nada que parezca contable o de precios salvo que el encargado lo pida. (El contenido de los archivos que leas se envía al servicio de Claude para analizarlo: por eso hay que ser prudente.)
5. Escribí el resultado en `ARBOL-ACTUAL.md`: el árbol que se deduce (sectores, subsectores, equipos), cómo se nombran los archivos, repeticiones o desorden que veas, y las columnas de las planillas. **Solo estructura y conclusiones: nunca copies el contenido de los manuales ni los datos de las planillas** a este repositorio (se sube a GitHub).
6. Mostráselo al encargado: "esto entendí así, ¿está bien?". Que lo corrija.

### Paso 1 · Entrevista
Hacé **todas las preguntas que hagan falta**, **de a una por vez**, cortas, en palabras de planta (no de sistemas). Si una respuesta abre otra duda, preguntala. No pases al paso siguiente hasta que el encargado diga que está listo. Para no olvidar temas:
- Cómo está organizada la planta y cuántos equipos hay; cuáles son críticos.
- Cómo se registran hoy los trabajos (papel, Excel, WhatsApp, de memoria).
- Qué trabajos se repiten y con qué frecuencia; quién se acuerda de hacerlos.
- Quién hace qué en mantenimiento; quién asigna y quién ejecuta; si trabajan en equipo; turnos.
- Qué pasa cuando una máquina se rompe a media producción.
- Cómo se piden, se guardan y se usan los repuestos; qué falta o se pierde.
- Dónde están los manuales y quién los consulta; cómo se buscan hoy.
- Con qué dispositivos trabajan los técnicos; si hay buena señal en la planta; si usan guantes o tienen las manos sucias.
- Qué informes o números le piden a mantenimiento.
- Qué es lo que más les molesta del sistema de hoy.

### Paso 2 · Propuesta (todavía sin programar)
Mostrá cómo serían las pantallas **con palabras y esquemas simples** (dibujos de texto), pantalla por pantalla, cada una respondiendo una pregunta clara ("¿qué tengo que hacer hoy?", "¿qué le pasó a esta máquina?", "¿dónde está el manual?"). Ajustalas con el encargado hasta que las apruebe.

### Paso 3 · Aprobación
Recién cuando el encargado diga con claridad "dale, armalo" se escribe código. **Una etapa por vez**, no todo junto.

### Paso 4 · Construcción y revisión
Con datos de ejemplo **inventados**, detrás de funciones `useAlgo()` (ver `CLAUDE.md`). Mostralo funcionando en el navegador (`pnpm run dev`), también en tamaño de celular, y ajustá con el encargado. Cuando algo queda decidido, anotalo.

## 5. Documentos que vas escribiendo (con permiso de la persona)
- **`ARBOL-ACTUAL.md`**: el árbol de lo que existe hoy (paso 0).
- **`DECISIONES.md`**: qué se decidió, cuándo y por qué (una línea cada una). Incluí qué preguntas de la sección 3 se resolvieron y cómo.
- **`NOTAS-PARA-ERIC.md`**: lo que la base de datos tendrá que guardar para que las pantallas funcionen: tablas, columnas, relaciones, quién puede ver, crear, editar o borrar cada cosa, y qué opciones configurables hay. Se actualiza al terminar cada etapa.

## 6. Mapa del proyecto (para no empezar de cero)
- **Pantallas del módulo hoy:** `src/pages/MantenimientoPage.tsx` (pestañas) y `src/features/reparaciones/` (envío de repuestos a reparar). Ya existe una tabla simple de equipos; **el módulo nuevo la reemplaza y amplía**.
- **QR:** cómo se genera el de los repuestos, en `src/features/items/DescargarQrModal.tsx`; el escáner, en `src/features/scanner/`.
- **PDF (etiquetas, informes):** `src/lib/generarRotuloPdf.ts` y similares (librería `jspdf`).
- **Campos personalizables ya resueltos una vez:** mirá cómo se hace en la configuración de comisionistas (`src/features/admin/ComisionistasCamposPane.tsx`).
- **Roles que ya existen:** administrador de Mantenimiento y usuario de Mantenimiento (ver `src/lib/types.ts`); el dueño de la empresa puede todo. El módulo respeta esos roles.
- **Componentes y estilo:** `src/components/`, `src/components/ui/`, `src/styles/`. Íconos: `<Icono n="…" />`.
