# Reglas del proyecto (leer antes de hacer cualquier cosa)

## REGLA DE ORO: no hagas nada sin consultar
- **No escribas, edites, muevas ni borres ningún archivo sin que la persona lo haya aprobado antes con un "sí" claro.** Antes de cada cambio, decí en **una frase** qué vas a hacer y esperá.
- **Esto vale también para cambios chicos** (poner un nombre a un campo, mover un botón), para instalar paquetes y para guardar o subir con git.
- **Ante la duda, preguntá.** Una pregunta por vez, con palabras simples y, si se puede, con opciones para elegir. Es mejor hacer diez preguntas de más que una pantalla equivocada.
- Este proyecto arranca en **modo plan**. No salgas de ese modo ni pidas permisos amplios por tu cuenta.
- **No programes ni armes nada hasta que la propuesta esté aprobada** (ver "Cómo se trabaja").

## Qué es esto y con quién hablás
Esta carpeta es una copia de **la app real de "Gestión empresarial"** (la que usa la empresa): Next.js 16 + React 19 + TypeScript, con una
base de datos PostgreSQL que corre en esta computadora (PGlite) y que trae **solo datos inventados**.
La persona que te habla es el **encargado de mantenimiento** de una planta y **no sabe programar**. Explicale todo en español simple, sin jerga, de a una cosa por vez.
Tu trabajo es ayudarlo a **seguir diseñando el módulo de Mantenimiento** sobre la app real. Eric (el programador) revisa lo que suba y lo lleva a la app de la empresa.

## Lo primero: leé estos archivos
- `COMO-QUEDO-MANTENIMIENTO.md`: cómo quedó armado el módulo en la app (lo que el encargado diseñó antes, ya funcionando, y en qué cambió).
- `MODULO-MANTENIMIENTO.md` y `DECISIONES.md`: el producto (**es genérico, para muchas empresas, no solo para esta planta**) y lo que se decidió.
- `NOTAS-PARA-ERIC.md`: lo que el encargado le dejó anotado a Eric.
Su app anterior (la vieja, de antes de la app nueva) está guardada en git con la marca `app-vieja`, por si hace falta mirar cómo era algo (`git show app-vieja:<archivo>`). No se trae tal cual: la app nueva funciona distinto.

## Cómo está armada la app (lo necesario para no perderse)
- `web/src/app/(app)/mantenimiento/`: las **páginas** del módulo (cada carpeta es una dirección: `inicio`, `equipos`, `ordenes`, `calendario`, `sector/[id]`…) y las **acciones** (`acciones*.ts`: lo que lee y guarda en la base, siempre en el servidor y con los permisos de cada persona).
- `src/features/mantenimiento/`: los **componentes** de las pantallas (fichas, formularios, listas) y la lógica que no depende de la base (fechas, circuito de las OT, costos), con sus pruebas (`*.test.ts`).
- `src/components/` y `src/components/ui/`: botones, ventanas, campos… compartidos por toda la app. `src/styles/`: los estilos.
- `supabase/componentes/` y `web/db/`: **la base de datos** (tablas, reglas y permisos). Es de Eric: no se toca.
- `arrancar/`: lo que arranca la app y la base con los datos de ejemplo (`arrancar/base.mjs` tiene los datos inventados).

## Cómo se trabaja (siempre en este orden)
1. **Entender el pedido:** las preguntas necesarias, de a una por vez. Mirar primero cómo está hoy en la app (en el navegador y en el código, solo lectura).
2. **Propuesta:** contar qué pantallas cambian y cómo, con palabras y esquemas simples, **sin programar**, y ajustarla juntos.
3. **Aprobación explícita** del encargado ("dale, armalo"). Una etapa por vez.
4. **Construcción y revisión** probando en el navegador (`pnpm run dev`), también en ancho de celular, con los usuarios de ejemplo de cada rol.
Dejá lo decidido por escrito en `DECISIONES.md`.

## Lo que SÍ hacés (cuando ya está aprobado)
- Cambiar y crear pantallas y componentes de Mantenimiento: `web/src/app/(app)/mantenimiento/` y `src/features/mantenimiento/`.
- Usar los datos que la app ya tiene: las acciones que existen (`acciones*.ts`) y lo que ya traen las páginas.
- Parecerte a lo que ya existe: componentes de `src/components/` y `src/components/ui/`, estilos de `src/styles/`.
- Íconos: siempre `<Icono n="nombre" />` (`src/components/Icono.tsx`). **Nunca emojis ni símbolos sueltos** (✓, ●, ⋮…). Si falta un ícono, se agrega una línea en ese archivo.
- Textos en español rioplatense (vos), como el resto de la app. **Pensá primero en el celular.**
- Palabras neutras (no propias de una fábrica) en lo que ve el usuario, y lo que una empresa pueda querer distinto, como **opción configurable**.

## Datos que todavía no existen en la base
**No crees tablas, columnas ni reglas** (no toques `supabase/` ni `web/db/`): eso lo hace Eric para que funcione igual en todas las empresas.
Si una pantalla necesita algo nuevo:
1. Definí los tipos en `src/features/mantenimiento/tipos.ts`.
2. Poné datos de ejemplo **inventados**, marcados como ejemplo, en un archivo aparte de `src/features/mantenimiento/` (por ejemplo `datosDeEjemplo.ts`).
3. La pantalla los pide a una función propia (en un archivo aparte) que **hoy devuelve esos datos de ejemplo** con la forma que tendrían en la base. Así Eric solo cambia el interior de esa función cuando arme la base.
4. Anotalo en `NOTAS-PARA-ERIC.md`: qué datos hacen falta, quién puede verlos o cambiarlos.

## Lo que NO hacés (sin preguntarle antes a Eric)
- No toques: `supabase/`, `web/db/`, `arrancar/`, `web/src/lib/` (sesión, base, permisos), `web/src/proxy.ts`, `src/lib/types.ts`, `src/lib/modulos*`, ni nada de permisos, licencias o usuarios.
- No cambies las otras áreas (Directorio, Depósito, Compras, Tareas, Configuración) salvo lo justo para enganchar algo de Mantenimiento, y avisando.
- No agregues librerías (`pnpm add`, `npm install <algo>`) ni cambies `package.json`, `next.config.ts` o `tsconfig*.json`.
- **No subas, imprimas ni pidas contraseñas o claves reales.** Los usuarios de ejemplo (`…@ejemplo.test`, contraseña `Ejemplo-2026`) son inventados y solo existen en esta computadora.
- **No copies al repositorio el contenido de manuales, planillas ni datos reales** de la empresa (este repositorio se sube a GitHub). Solo estructura y conclusiones.
- No compartas ni copies este código fuera de esta computadora.

## Cómo entregás
1. Antes de dar un tramo por terminado: `pnpm test`, `pnpm lint` y `pnpm typecheck` tienen que pasar sin errores. Probalo en el navegador (`pnpm run dev`), también en ancho de celular, y decile a la persona qué mirar.
2. Cuando la persona lo pida ("guardá los cambios y subilos"): `git commit` con mensajes claros y `git push` (rama `main`, la única que hay).
3. Al terminar cada etapa, actualizá `NOTAS-PARA-ERIC.md` y `DECISIONES.md`.

## Datos útiles
- `pnpm run dev` arranca todo (la base de ejemplo y la app en http://localhost:3020). Los usuarios de ejemplo están en `LEEME.md`. `pnpm run datos-nuevos` vuelve la base a los datos de ejemplo.
- Roles de Mantenimiento (columna `rol_equipos` de la persona): **responsable** (`admin`: equipos, rutinas, planillas, configuración del módulo), **jefe** de taller (asigna y revisa las OT), **técnico** (hace las OT) y **consulta** (solo mira). El dueño puede todo. El calendario lo ven los dueños y a quien se le dé el permiso.
- Cuidado con un nombre viejo: `mantenimiento_rol` es el rol de la persona **en el Depósito**, no en Mantenimiento. Las **reparaciones** (lo que se manda a reparar afuera) son del Depósito.
- Idioma de la interfaz: español (Argentina), fechas con `es-AR`. Las pruebas (`pnpm test`) son rápidas y no necesitan internet.
