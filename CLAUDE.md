# Reglas del proyecto (leer antes de hacer cualquier cosa)

## REGLA DE ORO: no hagas nada sin consultar
- **No escribas, edites, muevas ni borres ningún archivo sin que la persona lo haya aprobado antes con un "sí" claro.** Antes de cada cambio, decí en **una frase** qué vas a hacer y esperá.
- **Esto vale también para cambios chicos** (poner un nombre a un campo, mover un botón), para instalar paquetes y para guardar o subir con git.
- **Ante la duda, preguntá.** Una pregunta por vez, con palabras simples y, si se puede, con opciones para elegir. Es mejor hacer diez preguntas de más que una pantalla equivocada.
- Este proyecto arranca en **modo plan**. No salgas de ese modo ni pidas permisos amplios por tu cuenta.
- **No programes ni armes nada hasta terminar la entrevista y que la propuesta esté aprobada** (ver "Cómo se trabaja").

## Qué es esto y con quién hablás
Esta carpeta tiene **solo las pantallas** de "Gestión empresarial", un sistema para empresas (React 19 + TypeScript + Vite). No hay base de datos acá y no se crea ninguna.
La persona que te habla es el **encargado de mantenimiento** de una planta y **no sabe programar**. Explicale todo en español simple, sin jerga, de a una cosa por vez.
Tu trabajo es ayudarlo a **diseñar el módulo de Mantenimiento** (y recién después construir las pantallas). Eric conectará las pantallas con la base de datos más adelante.

## Lo primero: leé `MODULO-MANTENIMIENTO.md`
Ahí están el contexto del producto (**es genérico, para muchas empresas, no solo para esta planta**), el punto de partida, lo que está abierto y el método paso a paso. Leelo antes de proponer nada.

## Cómo se trabaja (siempre en este orden)
0. **Mirar lo que ya existe, solo lectura:** las carpetas de manuales y planillas del encargado. Nunca modificar, mover ni borrar nada de ellas. Primero la estructura; antes de abrir a fondo una planilla o un PDF, decir qué es y esperar el visto bueno.
1. **Entrevista:** todas las preguntas necesarias, de a una por vez, sobre cómo trabajan hoy.
2. **Propuesta:** mostrar las pantallas con palabras y esquemas simples, **sin programar**, y ajustarlas juntos.
3. **Aprobación explícita** del encargado ("dale, armalo"). Una etapa por vez.
4. **Construcción y revisión** con datos de ejemplo inventados, probando en el navegador.
Dejá lo decidido por escrito (ver `MODULO-MANTENIMIENTO.md`, sección 5).

## Lo que SÍ hacés (cuando ya está aprobado)
- Todo lo nuevo va en `src/features/mantenimiento/` y se engancha desde `src/pages/MantenimientoPage.tsx`.
- Parecerte a lo que ya existe: componentes de `src/components/` y `src/components/ui/`, estilos de `src/styles/`, y el estilo de `src/features/reparaciones/` e `src/features/items/`.
- Íconos: siempre `<Icono n="nombre" />` (`src/components/Icono.tsx`). **Nunca emojis ni símbolos sueltos** (✓, ●, ⋮…): hay una prueba que lo controla. Si falta un ícono, se agrega una línea en ese archivo.
- Textos en español rioplatense (vos), como el resto de la app. **Pensá primero en el celular.**
- Palabras neutras (no propias de una fábrica) en lo que ve el usuario, y lo que una empresa pueda querer distinto, como **opción configurable**.

## Datos nuevos: siempre detrás de un "hook"
Las tablas que ya existen se piden con el cliente de datos que ya usa la app (mirá los archivos `use*.ts` de cada carpeta de `src/features/`). Para lo que **todavía no existe en la base**, no inventes tablas ni llames a nada nuevo del servidor:
1. Definí los tipos en `src/features/mantenimiento/tipos.ts`.
2. Poné datos de ejemplo **inventados** en `src/features/mantenimiento/datosDemo.ts`, marcados como ejemplo.
3. Cada pantalla pide sus datos a una función propia (`useAlgo()`, en un archivo aparte) que **hoy devuelve los datos de ejemplo** con la misma forma que devolvería la base. Así Eric solo cambia el interior de esa función cuando conecte la base.

## Lo que NO hacés (sin preguntarle antes a Eric)
- No toques: `src/auth/`, `src/lib/types.ts`, `src/lib/database.types.ts`, `src/lib/modulos.ts`, `src/lib/modulos.json`, `src/lib/supabaseClient.ts`, ni nada de permisos o licencias.
- No cambies las pantallas que ya existen (Directorio, Depósito, Tareas, Configuración) salvo para enganchar el módulo nuevo.
- No agregues librerías (`pnpm add`) ni cambies `package.json`, `vite.config.ts` o `tsconfig*.json`.
- **No subas, imprimas ni pidas contraseñas o claves.** El `.env` de este repositorio trae solo la dirección y la clave **pública** de una base de pruebas: no lo cambies ni agregues otras claves a ningún archivo.
- **No copies al repositorio el contenido de manuales, planillas ni datos reales** de la empresa (este repositorio se sube a GitHub). Solo estructura y conclusiones.
- No borres ni modifiques datos en masa de la base a la que se conecta la app: es una copia de datos reales. Para probar, creá registros que digan "PRUEBA".
- No compartas ni copies este código fuera de esta computadora.

## Cómo entregás
1. Antes de dar un tramo por terminado: `pnpm test`, `pnpm lint` y `pnpm build` tienen que pasar sin errores. Probalo en el navegador (`pnpm run dev`), también en ancho de celular, y decile a la persona qué mirar.
2. Cuando la persona lo pida ("guardá los cambios y subilos"): `git commit` con mensajes claros y `git push` (rama `main`, la única que hay).
3. Al terminar cada etapa, actualizá `NOTAS-PARA-ERIC.md` (qué datos necesita cada pantalla, quién puede ver o cambiar qué, qué opciones configurables hay).

## Datos útiles
- Idioma de la interfaz: español (Argentina), fechas con `es-AR`.
- Los módulos de la app se prenden y apagan por cliente. Mantenimiento ya existe como módulo (hoy tiene solo una tabla simple de equipos). Las **reparaciones** (lo que se manda a reparar afuera) **no son de Mantenimiento**: son del Depósito. El módulo nuevo va dentro de Mantenimiento.
- Las pruebas (`pnpm test`) son rápidas y no necesitan internet.
