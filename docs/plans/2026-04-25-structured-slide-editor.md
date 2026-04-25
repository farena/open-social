# Structured Slide Editor — Implementation Plan

> **For agentic workers:** REQUIRED SKILL: `write-plan` for planning and `implementator`/`reviewer` for execution and validation.

**Goal:** Reemplazar el modelo "slide = string de HTML libre" por un modelo estructurado de elementos (`background`, `text`, `image`, `shape`) editable visualmente con click-to-edit, drag y resize, sin romper el pipeline de export PNG.

**Architecture:** El JSON estructurado del slide es la única fuente de verdad. Un serializer determinístico lo convierte a HTML body-only que pasa por el `wrapSlideHtml()` existente y se renderiza en iframe `sandbox=""`. El editor vive como overlay en el parent: usa el mismo JSON para calcular hit-targets, drag handles y posición de inputs flotantes — nunca lee el DOM del iframe. La IA pasa de generar HTML a operar via endpoints granulares JSON validados con zod.

**Tech Stack:** Next 16 + React 19 + TS 5 + Tailwind 4 (existente). Nuevas deps: `zod` (schemas), `lexical` + `@lexical/react` (rich text inline), `node-html-parser` (migrator one-shot), `vitest` (tests del serializer/schema/migrator).

---

## Scope

**In:** Modelo de datos JSON estructurado, serializer, parser/migrator one-shot, editor overlay con drag/resize/select, panel de propiedades, edición inline rich text con Lexical, endpoints granulares para la IA, reescritura del system prompt, tests del pipeline crítico.

**Out (V1):** Multi-select, grupos, rotación, animaciones, colaboración multi-usuario, undo intra-sesión granular (solo `undoSlide` server-side), guías inteligentes/snap entre elementos (solo snap a grid 4px y centros del canvas).

---

## File map

### New files

| Path | Responsibility |
|---|---|
| `src/types/slide-model.ts` | Tipos del nuevo modelo: `SlideElement`, `TextElement`, `ImageElement`, `ShapeElement`, `BackgroundElement`, `Span` |
| `src/lib/slide-schema.ts` | zod schemas + parsers compartidos cliente/server |
| `src/lib/slide-serializer.ts` | `serializeSlideToHtml(slide)` → body-only HTML string |
| `src/lib/slide-migrator.ts` | `parseHtmlToSlide(html, aspectRatio)` → estructura best-effort + flag `legacyHtml` |
| `src/lib/slide-defaults.ts` | Factories: `createTextElement()`, `createImageElement()`, `createShapeElement()`, `createDefaultBackground()`, `createEmptyStructuredSlide()` |
| `src/lib/slide-coords.ts` | Math helpers: `clampToCanvas`, `snapToGrid`, `screenToCanvas`, `canvasToScreen` |
| `src/components/editor/SlideCanvas.tsx` | Container que une iframe + overlay; gestiona scale y reducer del slide |
| `src/components/editor/SlideOverlay.tsx` | Capa transparente sobre el iframe; hit-test, selección, drag, resize |
| `src/components/editor/PropertiesPanel.tsx` | Sidebar derecho con controles según `kind` del elemento seleccionado |
| `src/components/editor/LexicalTextEditor.tsx` | Editor inline rich-text que monta sobre un `TextElement` seleccionado |
| `src/components/editor/handles/SelectionFrame.tsx` | Frame azul + 8 handles de resize alrededor del elemento seleccionado |
| `src/components/editor/handles/AddElementMenu.tsx` | Menú "+ Agregar" del PropertiesPanel cuando no hay selección |
| `src/components/editor/properties/TextProperties.tsx` | Controles del panel cuando el elemento seleccionado es text |
| `src/components/editor/properties/ImageProperties.tsx` | Controles cuando es image |
| `src/components/editor/properties/ShapeProperties.tsx` | Controles cuando es shape |
| `src/components/editor/properties/BackgroundProperties.tsx` | Controles del background del slide (cuando no hay selección) |
| `src/app/api/carousels/[id]/slides/[slideId]/elements/route.ts` | `POST` — agregar elemento |
| `src/app/api/carousels/[id]/slides/[slideId]/elements/[elementId]/route.ts` | `PATCH` — modificar elemento, `DELETE` — borrar |
| `src/app/api/carousels/[id]/slides/[slideId]/background/route.ts` | `PUT` — reemplazar background |
| `scripts/migrate-slides-to-structured.mjs` | Script one-shot: parsea `data/carousels.json`, escribe estructurado, hace backup |
| `tests/slide-serializer.test.ts` | Tests snapshot del serializer |
| `tests/slide-schema.test.ts` | Tests de validación zod |
| `tests/slide-migrator.test.ts` | Tests del parser HTML→JSON con fixtures |
| `vitest.config.ts` | Config mínima de Vitest |

### Modified files

| Path | Change |
|---|---|
| `src/types/carousel.ts` | `Slide` reemplazado: nuevos campos (`background`, `elements`, `legacyHtml?`, `previousVersions: SlideSnapshot[]`). El campo `html` se elimina (clean break) |
| `src/lib/slide-html.ts` | Sin cambios funcionales — sigue siendo el wrapper |
| `src/lib/carousels.ts` | `addSlide` acepta el nuevo shape; `updateSlide` versiona snapshots JSON; nuevos métodos `updateBackground`, `addElement`, `updateElement`, `deleteElement`; `undoSlide` opera sobre `SlideSnapshot` |
| `src/lib/chat-system-prompt.ts` | Reescritura completa: documenta el modelo JSON, ejemplos curl con los nuevos endpoints, sin instrucciones HTML |
| `src/lib/export-slides.ts` | Cambia el input: en vez de `slide.html` usa `serializeSlideToHtml(slide)` antes de `wrapSlideHtml()` |
| `src/components/editor/CarouselPreview.tsx` | Reemplaza `SlideRenderer` por `SlideCanvas` para el slide activo; mantiene `SlideRenderer` para thumbnails |
| `src/components/editor/SlideRenderer.tsx` | Refactor: ahora acepta `slide: Slide` en vez de `html: string`; serializa internamente. Sigue siendo read-only |
| `src/components/editor/SlideFilmstrip.tsx` | Pasa `slide` al renderer en vez de `html` |
| `src/app/api/carousels/[id]/slides/route.ts` | `POST` valida con zod, acepta nuevo shape (sin `html`); fallback: si recibe `html`, lo migra al vuelo |
| `src/app/api/carousels/[id]/slides/[slideId]/route.ts` | `PUT` valida con zod, acepta `slide` JSON estructurado |
| `package.json` | Agregar `zod`, `lexical`, `@lexical/react`, `node-html-parser`, `vitest` |

---

## Phases & Tasks

Fases ordenadas por dependencia. Dentro de cada fase, tasks independientes pueden paralelizarse.

### Phase 0 — Setup (deps + tests)

#### Task 0.1: Instalar dependencias

**Files:**
- Modify: `package.json`

- [ ] Run: `npm install zod lexical @lexical/react node-html-parser`
- [ ] Run: `npm install -D vitest @vitest/ui`
- [ ] Run: `npm run build` — confirma que no hay regresión de tipos
- [ ] Commit: `chore: add zod, lexical, vitest, node-html-parser`

#### Task 0.2: Configurar Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (script `test`)

- [ ] Crear `vitest.config.ts` con resolve alias `@/` → `./src`
- [ ] Agregar `"test": "vitest run"` y `"test:watch": "vitest"` a scripts
- [ ] Run: `npm run test` — sale sin tests, debe terminar OK
- [ ] Commit: `chore: vitest config and scripts`

---

### Phase 1 — Foundation (model + schema + serializer)

#### Task 1.1: Definir tipos del modelo estructurado

**Files:**
- Create: `src/types/slide-model.ts`
- Modify: `src/types/carousel.ts`

- [ ] Crear `slide-model.ts` con `SlideElement` (union), `TextElement`, `ImageElement`, `ShapeElement`, `BackgroundElement`, `Span`, `SlideSnapshot`
- [ ] Modificar `Slide` en `carousel.ts`: eliminar `html`, agregar `background`, `elements`, `legacyHtml?`, cambiar `previousVersions` a `SlideSnapshot[]`
- [ ] Run: `npm run build` — esperan errores de TypeScript en archivos que tocan `slide.html` (los corregimos en tasks siguientes; OK por ahora)
- [ ] Commit: `feat(types): structured slide model`

#### Task 1.2: zod schemas

**Files:**
- Create: `src/lib/slide-schema.ts`
- Test: `tests/slide-schema.test.ts`

- [ ] **Step 1: Test failing** — `tests/slide-schema.test.ts` con casos: text válido, text con span sin content (debe fallar), shape con shape inválido, image con src vacío, background con kind desconocido
- [ ] **Step 2: Run test, confirm fail** — `npm run test`
- [ ] **Step 3: Implementar** — `slideElementSchema`, `slideSchema`, `elementPatchSchema`, `backgroundSchema` en `slide-schema.ts`. Exportar tipos inferidos `z.infer<typeof X>` y verificar que coinciden con `slide-model.ts`
- [ ] **Step 4: Run test, confirm pass** — `npm run test`
- [ ] Commit: `feat(schema): zod validation for slide model`

#### Task 1.3: Defaults / factories

**Files:**
- Create: `src/lib/slide-defaults.ts`
- Create: `src/lib/slide-coords.ts`

- [ ] `slide-defaults.ts`: factories que devuelven elementos válidos (id generado, posición/tamaño razonable). Ej: `createTextElement({ x, y, content })` devuelve un `TextElement` con un span default
- [ ] `slide-coords.ts`: `clampToCanvas(pos, size, canvas)`, `snapToGrid(value, step=4)`, `screenToCanvas(point, scale, origin)`, `canvasToScreen(point, scale, origin)`
- [ ] Tests inline rápidos en sus respectivos archivos (importables)
- [ ] Commit: `feat(slides): defaults and coordinate helpers`

#### Task 1.4: Serializer JSON → HTML body

**Files:**
- Create: `src/lib/slide-serializer.ts`
- Test: `tests/slide-serializer.test.ts`

- [ ] **Step 1: Test failing** — fixture `tests/fixtures/slide-basic.json` con un slide de 1 background gradient + 1 text + 1 shape; expected HTML como snapshot
- [ ] **Step 2: Run test, confirm fail**
- [ ] **Step 3: Implementar `serializeSlideToHtml(slide)`**:
  - Si `slide.legacyHtml` existe, devolverlo tal cual (escape hatch)
  - Generar un `<div data-slide-root>` root con dimensiones del canvas y el background
  - Para cada elemento (en orden de `elements[]`, que define z-index): `<div data-element-id data-element-kind position:absolute>`
  - Text: span por span, con estilos individuales; alignment via flex
  - Image: `<img>` con object-fit
  - Shape: div estilizado (rect / circle via borderRadius 50%)
  - **No** generar `<script>` ni nada que el sandbox bloquee
- [ ] **Step 4: Run test, confirm pass**
- [ ] Agregar fixture `slide-multi-text.json` con un text de 3 spans estilos distintos; snapshot
- [ ] Commit: `feat(slides): serializer JSON→HTML`

#### Task 1.5: Smoke visual del serializer (manual)

**Files:**
- (none — solo verificación)

- [ ] Crear un script ad-hoc: leer `tests/fixtures/slide-basic.json`, serializar, pasar por `wrapSlideHtml`, escribir a `/tmp/slide-preview.html`, abrir con browser
- [ ] Validar visualmente que el render coincide con la intención del fixture
- [ ] Si está OK, eliminar el script (no commitear)

---

### Phase 2 — Storage layer (carousels.ts + APIs)

#### Task 2.1: Refactor `carousels.ts` para snapshots JSON

**Files:**
- Modify: `src/lib/carousels.ts`

- [ ] `addSlide`: aceptar `Pick<Slide, "background" | "elements" | "legacyHtml" | "notes">` (sin html)
- [ ] `updateSlide`: aceptar `Partial<Pick<Slide, "background" | "elements" | "legacyHtml" | "notes">>`. Si cambia `background` o `elements` o `legacyHtml`, snapshot el estado anterior a `previousVersions[]` (cap 5)
- [ ] `undoSlide`: pop snapshot, restaurar campos
- [ ] Nuevos métodos:
  - `updateSlideBackground(carouselId, slideId, background)`
  - `addSlideElement(carouselId, slideId, element)` — push y devolver el slide actualizado
  - `updateSlideElement(carouselId, slideId, elementId, patch)` — merge parcial
  - `deleteSlideElement(carouselId, slideId, elementId)` — filter
- [ ] Cada uno snapshotea antes de mutar
- [ ] Run: `npm run build` — TS debe pasar
- [ ] Commit: `feat(carousels): JSON-snapshot versioning and element-level CRUD`

#### Task 2.2: Validar inputs en APIs existentes

**Files:**
- Modify: `src/app/api/carousels/[id]/slides/route.ts` (POST)
- Modify: `src/app/api/carousels/[id]/slides/[slideId]/route.ts` (PUT, DELETE)

- [ ] `POST /slides`: validar body con `z.union([slideShapeForCreate, legacyHtmlShape])`. Si recibe `{ html }` (legacy), llamar `parseHtmlToSlide()` (Phase 3). Por ahora, hasta que el migrator esté, fallar 400 con un mensaje claro: "html-only payload not supported, send structured slide"
- [ ] `PUT /slides/[slideId]`: validar con zod, aceptar partial del slide
- [ ] Errores 400 devuelven el detalle de zod
- [ ] Run: `npm run build`
- [ ] Commit: `feat(api): zod validation on slide endpoints`

#### Task 2.3: Endpoint granular `PUT /background`

**Files:**
- Create: `src/app/api/carousels/[id]/slides/[slideId]/background/route.ts`

- [ ] Handler `PUT`: parsea body con `backgroundSchema`, llama `updateSlideBackground`
- [ ] Devuelve el slide actualizado o 404
- [ ] Smoke test manual con curl
- [ ] Commit: `feat(api): PUT slide background`

#### Task 2.4: Endpoints granulares de elementos

**Files:**
- Create: `src/app/api/carousels/[id]/slides/[slideId]/elements/route.ts`
- Create: `src/app/api/carousels/[id]/slides/[slideId]/elements/[elementId]/route.ts`

- [ ] `POST /elements`: valida elemento, llama `addSlideElement`. Si no viene `id`, generarlo
- [ ] `PATCH /elements/[elementId]`: valida `elementPatchSchema`, llama `updateSlideElement`
- [ ] `DELETE /elements/[elementId]`: llama `deleteSlideElement`
- [ ] Smoke test manual con curl para los tres
- [ ] Commit: `feat(api): granular element endpoints`

---

### Phase 3 — Migrator (HTML → JSON)

#### Task 3.1: Parser de HTML legacy

**Files:**
- Create: `src/lib/slide-migrator.ts`
- Test: `tests/slide-migrator.test.ts`

- [ ] **Step 1: Test failing** — fixtures `tests/fixtures/legacy-slide-1.html` (slide simple: gradient bg + texto centrado) y `legacy-slide-complex.html` (un slide real copiado de `data/carousels.json`)
- [ ] **Step 2: Run test, confirm fail**
- [ ] **Step 3: Implementar `parseHtmlToSlide(html, aspectRatio)`**:
  - Usar `node-html-parser`
  - Heurísticas:
    - Root `<div>` con `background:` o `background-image:` o `background-color:` → `BackgroundElement`
    - `<img>` → `ImageElement` (extraer width/height, src, border-radius)
    - `<div>` con texto y sin descendientes-bloque → `TextElement` con un span (extraer font-family, font-size, color, font-weight, text-align, line-height del style)
    - `<div>` vacío con `background-color:`/`border-radius:` → `ShapeElement`
  - Para divs sin position absolute: usar el atributo `style` para extraer sus reglas y aproximar bounding box (si hay `padding`, `display:flex`, etc., mejor esfuerzo). Si no se puede, devolver `legacyHtml: html` y `elements: []`
  - Devolver `{ background, elements, legacyHtml? }`
- [ ] **Step 4: Run test, confirm pass** — al menos el slide simple debe parsear bien; el complejo puede caer en `legacyHtml`
- [ ] Commit: `feat(slides): HTML→JSON migrator with legacy fallback`

#### Task 3.2: Script one-shot de migración

**Files:**
- Create: `scripts/migrate-slides-to-structured.mjs`

- [ ] El script:
  1. Backup `data/carousels.json` → `data/carousels.legacy-${YYYYMMDD-HHmm}.json`
  2. Para cada slide: `parseHtmlToSlide(slide.html, carousel.aspectRatio)` → reemplazar campos
  3. Convertir `previousVersions: string[]` → `SlideSnapshot[]` (cada uno parseado igual; si falla, `{ legacyHtml }`)
  4. Escribir `data/carousels.json` con el nuevo shape
  5. Imprimir resumen: cuántos slides parseados limpios, cuántos con `legacyHtml`
- [ ] Modo `--dry-run` que solo imprime el resumen sin escribir
- [ ] Run: `node scripts/migrate-slides-to-structured.mjs --dry-run` — verificar el resumen
- [ ] Run real: `node scripts/migrate-slides-to-structured.mjs`
- [ ] Verificar: `data/carousels.json` ahora tiene el nuevo shape; backup existe
- [ ] Run: `npm run dev` y confirmar que la app no crashea (aunque la UI esté rota, los endpoints deben servir el carousel)
- [ ] Commit: `chore(data): one-shot migration to structured model`

---

### Phase 4 — Render path (read-only paridad)

#### Task 4.1: Refactor `SlideRenderer` para slide JSON

**Files:**
- Modify: `src/components/editor/SlideRenderer.tsx`
- Modify: `src/components/editor/SlideFilmstrip.tsx`

- [ ] `SlideRenderer` acepta `slide: Slide` en vez de `html: string`. Internamente llama `wrapSlideHtml(serializeSlideToHtml(slide), slide.aspectRatio || carousel.aspectRatio)`
- [ ] Update llamantes en `SlideFilmstrip` y donde se use
- [ ] Run: `npm run build` y `npm run dev`. Abrir el carousel y confirmar que las thumbnails se ven igual que antes (post-migración)
- [ ] Commit: `refactor(renderer): SlideRenderer accepts structured slide`

#### Task 4.2: Crear `SlideCanvas` mostrando read-only

**Files:**
- Create: `src/components/editor/SlideCanvas.tsx`
- Modify: `src/components/editor/CarouselPreview.tsx`

- [ ] `SlideCanvas` renderiza el iframe igual que `SlideRenderer`, pero con un `<div>` overlay vacío encima (`pointer-events: none` por ahora). Calcula scale igual que el original
- [ ] `CarouselPreview` usa `SlideCanvas` para el slide activo (no para thumbnails)
- [ ] Run: `npm run dev`. Verificar paridad visual con el preview anterior
- [ ] Commit: `feat(editor): SlideCanvas scaffold (read-only parity)`

---

### Phase 5 — Editor V1 (selection + drag + resize + properties)

#### Task 5.1: Reducer + estado del editor

**Files:**
- Modify: `src/components/editor/SlideCanvas.tsx`
- Create: `src/components/editor/useSlideEditor.ts` (hook con reducer)

- [ ] `useSlideEditor(initialSlide, onPersist)` — gestiona `slide` con `useReducer`. Acciones: `SELECT`, `DESELECT`, `MOVE_ELEMENT`, `RESIZE_ELEMENT`, `SET_ELEMENT_PROPS`, `ADD_ELEMENT`, `DELETE_ELEMENT`, `Z_REORDER`, `SET_BACKGROUND`, `EDIT_TEXT_SPANS`
- [ ] Cada mutación llama `onPersist(slide)` con debounce 400ms (usando `useEffect` + cleanup)
- [ ] `onPersist` (en `CarouselPreview` o page) hace `PUT /slides/[id]` con el slide completo (granular endpoints son para la IA; el editor manda bulk)
- [ ] Selection state: `{ elementId: string | null }`
- [ ] Commit: `feat(editor): reducer + persist hook`

#### Task 5.2: Hit-testing y selección visual

**Files:**
- Create: `src/components/editor/SlideOverlay.tsx`
- Create: `src/components/editor/handles/SelectionFrame.tsx`

- [ ] `SlideOverlay` renderiza un `<div>` por elemento (en orden), `position: absolute` con coords `canvasToScreen(element.position, scale)`. Cada div tiene `data-element-id` y captura `onPointerDown` que dispara `SELECT`
- [ ] El div del elemento seleccionado renderiza `<SelectionFrame>` por encima — borde 2px primary + 8 handles (esquinas + medios). Handles solo visuales en este task
- [ ] Click en el área vacía del overlay → `DESELECT`
- [ ] Verificar manualmente: click sobre cada elemento lo selecciona; click vacío deselecciona
- [ ] Commit: `feat(editor): hit-testing and selection frame`

#### Task 5.3: Drag de elementos

**Files:**
- Modify: `src/components/editor/SlideOverlay.tsx`

- [ ] En `pointerdown` del element div: si ya está seleccionado, iniciar drag (capturePointer); calcular delta en screen-space, convertir a canvas-space (`/scale`), aplicar `snapToGrid(_, 4)`, dispatch `MOVE_ELEMENT`. En `pointerup`: liberar capture
- [ ] Bound check: `clampToCanvas` para que no se salga
- [ ] Visual feedback: cursor `grabbing` durante drag
- [ ] Verificar: drag fluido, posición se persiste tras 400ms
- [ ] Commit: `feat(editor): drag elements`

#### Task 5.4: Resize por handles

**Files:**
- Modify: `src/components/editor/handles/SelectionFrame.tsx`

- [ ] Cada handle tiene un anchor (NW, N, NE, E, SE, S, SW, W). En `pointerdown` del handle: capturePointer; durante move: calcular delta, ajustar `position` y `size` según anchor
- [ ] `Shift` mantenido → preserva aspect ratio (escala uniforme)
- [ ] Mínimos: 8x8 px
- [ ] Verificar: resize por las 8 direcciones funciona, Shift preserva ratio
- [ ] Commit: `feat(editor): resize handles`

#### Task 5.5: Atajos de teclado

**Files:**
- Modify: `src/components/editor/SlideCanvas.tsx`

- [ ] `Delete`/`Backspace`: dispatch `DELETE_ELEMENT` si hay selección
- [ ] `Esc`: deselect
- [ ] `Cmd/Ctrl+D`: duplicar (clone con offset +20,+20 y nuevo id)
- [ ] `Cmd/Ctrl+Z`: llamar `POST /slides/[id]/undo`
- [ ] Flechas: mover 1px, +Shift = 10px
- [ ] Listeners en `window` solo cuando el canvas está focused
- [ ] Verificar manualmente cada uno
- [ ] Commit: `feat(editor): keyboard shortcuts`

#### Task 5.6: PropertiesPanel — controles básicos

**Files:**
- Create: `src/components/editor/PropertiesPanel.tsx`
- Create: `src/components/editor/properties/TextProperties.tsx`
- Create: `src/components/editor/properties/ImageProperties.tsx`
- Create: `src/components/editor/properties/ShapeProperties.tsx`
- Create: `src/components/editor/properties/BackgroundProperties.tsx`
- Create: `src/components/editor/handles/AddElementMenu.tsx`
- Modify: `src/components/editor/CarouselPreview.tsx` (mount panel)

- [ ] `PropertiesPanel` recibe `slide`, `selection`, `dispatch`. Si selection vacía → `BackgroundProperties` + `AddElementMenu`. Si no → render según `kind`
- [ ] `TextProperties`: alignment (left/center/right), lineHeight, letterSpacing, color del primer span (más adelante: por span con Lexical), fontSize del primer span, fontFamily (input texto libre)
- [ ] `ImageProperties`: src (input + upload trigger), fit (cover/contain), borderRadius (slider)
- [ ] `ShapeProperties`: shape (rect/circle), fill (color picker o gradient editor mínimo), border, borderRadius
- [ ] `BackgroundProperties`: tabs color/gradient/image; controles correspondientes
- [ ] `AddElementMenu`: 3 botones (Texto, Imagen, Forma); al hacer click crea el elemento default centrado y lo selecciona
- [ ] Layout: panel a la derecha, ~320px ancho. Color: `bg-white border-l` (alineado con el resto de la UI)
- [ ] Verificar: cada control modifica el iframe en <100ms; persiste tras 400ms
- [ ] Commit: `feat(editor): properties panel`

---

### Phase 6 — Lexical inline rich text

#### Task 6.1: Componente Lexical

**Files:**
- Create: `src/components/editor/LexicalTextEditor.tsx`

- [ ] `LexicalTextEditor` recibe `element: TextElement`, `onCommit(spans: Span[])`, `onCancel()`. Carga `lexical` y `@lexical/react` con dynamic import
- [ ] Inicializa el editor desde `element.spans` mapeando a `TextNode`s con styling (font-size, weight, color, italic, underline)
- [ ] Toolbar mínimo: B, I, U, color picker, font-size
- [ ] On Esc o blur: serializar nodos → `Span[]`, llamar `onCommit`
- [ ] Esquema de serialización: cada `TextNode` con run de estilos consistentes = un span. Cambios de estilo dentro = nuevo span
- [ ] Commit: `feat(editor): Lexical text editor component`

#### Task 6.2: Mount en doble click

**Files:**
- Modify: `src/components/editor/SlideOverlay.tsx`

- [ ] Doble click en un text element → entrar en modo edición; el `SelectionFrame` se oculta y monta `LexicalTextEditor` posicionado sobre el elemento (mismo bbox, escalado al canvas)
- [ ] `onCommit` → dispatch `EDIT_TEXT_SPANS`. Salir de edit mode
- [ ] Mientras edit mode: drag deshabilitado
- [ ] Verificar: edición rich text funciona, spans persisten, paridad con el iframe
- [ ] Commit: `feat(editor): inline text editing with Lexical`

---

### Phase 7 — IA: nuevo system prompt + endpoints

#### Task 7.1: Reescribir `chat-system-prompt.ts`

**Files:**
- Modify: `src/lib/chat-system-prompt.ts`

- [ ] Reescribir las secciones "Slide HTML rules" y "API" para describir el modelo JSON
- [ ] Documentar el shape exacto de `text`, `image`, `shape`, `background` y `Span`
- [ ] Reemplazar ejemplos curl por:
  - `POST /slides` con `{ background, elements: [], notes }`
  - `POST /slides/{sid}/elements` con un elemento
  - `PATCH /slides/{sid}/elements/{eid}` con un patch
  - `PUT /slides/{sid}/background`
- [ ] Mantener la sección "Design intelligence" (typography, color, layout) — es agnostica del formato
- [ ] Quitar referencias a `<style>`, `<script>`, "no DOCTYPE", etc. — ya no aplican
- [ ] Run: `npm run dev` y probar con un caso real ("creá un carousel sobre X"). Verificar que la IA usa los nuevos endpoints
- [ ] Commit: `feat(prompt): structured JSON model instructions`

#### Task 7.2: Defensive fallback para legacy `html` payload

**Files:**
- Modify: `src/app/api/carousels/[id]/slides/route.ts`

- [ ] Si la IA o un cliente manda `{ html: "..." }` por costumbre: `parseHtmlToSlide(html, carousel.aspectRatio)` y crear el slide. Loggear warning. Útil durante el periodo de transición del prompt
- [ ] Verificar manualmente: enviar curl con `{ html: "<div>test</div>" }` — debe crear un slide estructurado
- [ ] Commit: `feat(api): legacy html fallback for transitional payloads`

---

### Phase 8 — Export validation + cleanup

#### Task 8.1: Update export-slides

**Files:**
- Modify: `src/lib/export-slides.ts`

- [ ] Donde hoy lee `slide.html`, ahora hace `serializeSlideToHtml(slide)` y pasa eso a `wrapSlideHtml`
- [ ] Run: `POST /api/carousels/[id]/export` desde la UI — descargar ZIP, abrir un PNG
- [ ] Comparar pixel-perfect con el preview del editor (tomar screenshot del navegador y diffear)
- [ ] Commit: `feat(export): use structured serializer`

#### Task 8.2: Audit manual de slides migrados

**Files:**
- (none — solo verificación)

- [ ] Abrir cada carousel migrado en `/carousels/{id}` y revisar cada slide
- [ ] Para cada slide con `legacyHtml`: decidir si re-generar con la IA (preferido), editar a mano, o aceptar como legacy
- [ ] Documentar slides degradados en una nota interna (no se commitea)

#### Task 8.3: Cleanup — remover código muerto

**Files:**
- Modify: varios

- [ ] Buscar referencias residuales a `slide.html` (debería haber 0 después de Phase 8.1)
- [ ] Eliminar imports no usados, comentarios de TODO obsoletos
- [ ] Run: `npm run lint` y `npm run build`
- [ ] Commit: `chore: cleanup legacy html references`

---

## Validation matrix (acceptance criteria → tasks)

| AC | Tasks |
|---|---|
| 1. Click en text → edición Lexical | 6.1, 6.2 |
| 2. Drag actualiza position y persiste | 5.1, 5.3 |
| 3. Resize por 8 handles + Shift ratio | 5.4 |
| 4. Sidebar refleja en <100ms | 5.6 |
| 5. Add/delete/duplicate elemento | 5.5, 5.6 |
| 6. IA usa endpoints JSON | 2.3, 2.4, 7.1 |
| 7. Export pixel-perfect | 8.1 |
| 8. Migración sin pérdida (con legacy) | 3.1, 3.2, 8.2 |
| 9. Undo restaura snapshot | 2.1, 5.5 |
| 10. 60fps con 20 elementos | Manual smoke en 5.3, 5.4 |

---

## Risks and recovery

| Riesgo | Detección | Recovery |
|---|---|---|
| Migrador genera slides degradados | Audit manual (8.2) | `legacyHtml` preserva el HTML original; backup completo en `data/carousels.legacy-*.json` permite rollback total |
| Lexical bundle pesa demasiado | `npm run build` reporta tamaños | Dynamic import en 6.1 lo carga solo en edit mode |
| Drift overlay/iframe | Visual smoke en 5.2 | Ambos derivan del mismo JSON; si hay drift es bug del scale, no de modelo |
| zod schema diverge de TS types | `npm run build` debería detectar | Mantener `z.infer<typeof X>` como fuente; si TS rompe, alinear |
| IA sigue mandando HTML después del prompt nuevo | Logs del fallback (7.2) | Iterar el prompt; el fallback evita romper UX |
| Export drift vs preview | Diff manual en 8.1 | Mismo serializer + wrapSlideHtml = mismo HTML; cualquier drift es bug del wrapper de Puppeteer |

---

## Definition of Ready — pasada

- ✅ Problem y outcome explícitos
- ✅ Scope bounded (V1 explícito)
- ✅ AC testables (10 criterios)
- ✅ Constraints (wrapSlideHtml, sandbox, MAX_VERSIONS, chat session, Puppeteer)
- ✅ Solution approach + 4 decisiones validadas
- ✅ Riesgos identificados + recovery
- ✅ Validation plan (tests serializer/schema/migrator + smoke manual + export diff)
- ✅ Handoff con file paths exactos y secuenciamiento

---

## Execution mode

**Recomendado: inline en sesión actual.** Las tasks son densas pero no paralelizables fácilmente (cada fase bloquea a la siguiente). Trabajo secuencial con commits granulares es lo más legible.

**Excepción**: Phase 5 (5.2 hit-testing, 5.3 drag, 5.4 resize, 5.6 properties) podría delegarse a `implementator` en paralelo con la base de Phase 5.1 ya commiteada.

---

## Out of scope (V2+)

- Multi-select y bulk operations
- Grupos persistentes
- Rotación de elementos
- Auto-layout / flex containers
- Animaciones de slide
- Colaboración multi-usuario / presence
- Undo intra-sesión granular (cada drag = 1 step)
- Snap a edges/centros de otros elementos (smart guides)
- Catalog de iconos
- Templates a partir de slides estructurados
