# Dependency Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SKILL: `write-plan` for planning and `implementator`/`reviewer` for execution and validation.

**Goal:** Llevar `npm audit` a 0 advisories y dejar `package.json` higienizado, sin cambios funcionales en runtime.

**Architecture:** Tres tareas de seguridad (bumps que cierran advisories conocidos), una de mantenimiento opcional (versiones atrasadas sin advisory) y una de reorganización (mover deps de tooling a `devDependencies`). Cada tarea valida con `npm audit`, `npm test` y `npm run build`. Sin cambios de código fuente; el contrato de la API y el pipeline de slides quedan intactos.

**Tech Stack:** npm, Next.js 16, Puppeteer, React 19, Tailwind v4, Vitest.

**Source of truth:** reporte de `/security-review` ejecutado el 2026-05-01 sobre el árbol actual de `package.json` / `package-lock.json`. Advisories cubiertos:
- GHSA-rp42-5vxx-qpwr (HIGH) — `basic-ftp` vía `puppeteer`.
- GHSA-qx2v-qp2m-jg93 (MODERATE x2) — `postcss` vía `next@16.2.3`.

---

## Pre-flight

Antes de tocar nada:

```bash
git status                       # confirmar working tree limpio salvo cambios ya conocidos
npm audit --json | jq '.metadata.vulnerabilities'   # snapshot inicial: high=1 moderate=2
npm test
npm run build
```

Si `npm test` o `npm run build` ya fallan en `main`, parar y corregir esa baseline antes de seguir; de lo contrario los bumps van a recibir la culpa de un fallo preexistente.

**Rollback genérico de cualquier tarea:** `git checkout -- package.json package-lock.json && npm ci`.

---

### Task 1: Cerrar los 2 advisories MODERATE de postcss (next@16.2.4)

Resuelve GHSA-qx2v-qp2m-jg93 (XSS por `</style>` no escapado en stringify de PostCSS) heredado vía `next@16.2.3` → `postcss@8.4.31`. La 16.2.4 ya bumpea la dep transitiva.

**Files:**
- Modify: `package.json` (`dependencies.next`, `devDependencies.eslint-config-next`)
- Modify: `package-lock.json` (regenerado por npm)

- [ ] **Step 1: Bump next y eslint-config-next**
  ```bash
  npm i next@16.2.4 eslint-config-next@16.2.4
  ```
- [ ] **Step 2: Confirmar que los advisories de postcss desaparecieron**
  ```bash
  npm audit --json | jq '.vulnerabilities | keys'
  ```
  Esperado: `postcss` y `next` ya no figuran. Solo queda `basic-ftp`.
- [ ] **Step 3: Type-check + tests + build**
  ```bash
  npm run lint
  npm test
  npm run build
  ```
  Esperado: todos verdes. Si lint rompe por reglas nuevas de `eslint-config-next@16.2.4`, evaluar si son fixes auto-aplicables (`eslint --fix`) o si se debe pinear el config a 16.2.3 documentando el motivo.
- [ ] **Step 4: Smoke manual del dev server**
  ```bash
  npm run dev
  ```
  Verificar en `http://localhost:3000` que el dashboard carga, se puede abrir un content item, que un slide se renderiza dentro del iframe sandbox y que `POST /api/content/[id]/generate` sigue funcionando (puede ser un kick de prueba sin esperar el render completo).
- [ ] **Step 5: Commit**
  ```
  fix(deps): bump next to 16.2.4 to patch postcss XSS advisory

  Resolves GHSA-qx2v-qp2m-jg93 (postcss <8.5.10 XSS via unescaped
  </style> in stringify output). The vulnerable postcss@8.4.31 was
  pulled in transitively by next@16.2.3; next@16.2.4 ships postcss
  patched. Also bumps eslint-config-next to keep majors aligned.
  ```

**Risk:** bump patch de Next; muy bajo riesgo de breaking. Si Turbopack o el build introduce un fallo nuevo, rollback con `git checkout -- package.json package-lock.json && npm ci`.

---

### Task 2: Cerrar el advisory HIGH de basic-ftp (puppeteer@latest)

Resuelve GHSA-rp42-5vxx-qpwr (`basic-ftp <=5.2.2` DoS por consumo de memoria) heredado vía `puppeteer → @puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri → basic-ftp`. Sin parche de `basic-ftp` upstream — la cadena se rompe bumpeando puppeteer al sub-grafo nuevo.

**Files:**
- Modify: `package.json` (`dependencies.puppeteer`)
- Modify: `package-lock.json`

- [ ] **Step 1: Ver versión actual y target**
  ```bash
  npm view puppeteer version
  npm ls puppeteer
  ```
- [ ] **Step 2: Bump puppeteer**
  ```bash
  npm i puppeteer@latest
  ```
  Nota: el `postinstall` de `puppeteer` descarga Chromium; puede tardar varios minutos y requiere red.
- [ ] **Step 3: Confirmar que `npm audit` queda en cero**
  ```bash
  npm audit
  ```
  Esperado: `found 0 vulnerabilities`.
- [ ] **Step 4: Probar el path crítico — export de slides**
  El único uso real de Puppeteer es `src/lib/export-slides.ts` (invocado desde `POST /api/content/[id]/export`). Probar que el ZIP de PNGs se genera para al menos un content item con varios slides. Si hay tests E2E del export, correrlos; si no, probar manualmente desde la UI.
  ```bash
  npm test
  npm run build
  ```
- [ ] **Step 5: Commit**
  ```
  fix(deps): bump puppeteer to patch basic-ftp DoS advisory

  Resolves GHSA-rp42-5vxx-qpwr (basic-ftp <=5.2.2 unbounded memory
  consumption in Client.list()). basic-ftp is pulled in transitively
  through puppeteer's @puppeteer/browsers → proxy-agent chain.
  Bumping puppeteer rewrites the sub-tree past the vulnerable copy.
  ```

**Risk:** Puppeteer es la única dep con superficie de runtime relevante en este bump. Cambios entre 24.40 → 24.42 son patches/minors según `npm outdated`. Si la API de `puppeteer.launch()` cambia, ajustar `src/lib/export-slides.ts:23`. Rollback: `git checkout -- package.json package-lock.json && npm ci`.

---

### Task 3: Reubicar deps de tooling en devDependencies

`node-html-parser`, `gray-matter` y `minisearch` solo se usan en `scripts/wiki-query/` (CLI local de búsqueda en el wiki, ver `docs/plans/2026-05-01-wiki-query-cli.md`). Tenerlos en `dependencies` los empaqueta innecesariamente en producción y aumenta superficie de auditoría.

**Files:**
- Modify: `package.json` (mover 3 entradas de `dependencies` a `devDependencies`)
- Modify: `package-lock.json`

- [ ] **Step 1: Verificar que no haya imports en `src/`**
  ```bash
  grep -RnE "from ['\"](node-html-parser|gray-matter|minisearch)" src/ || echo "OK — sin uso en src/"
  ```
  Esperado: `OK`. Si aparece algún import en `src/`, **abortar la tarea** y dejar las deps en `dependencies` — no aplica.
- [ ] **Step 2: Mover las entradas en `package.json`**
  Editar a mano `package.json`: quitar `gray-matter`, `minisearch`, `node-html-parser` de `dependencies` y agregarlas en `devDependencies` con la misma versión.
- [ ] **Step 3: Regenerar lockfile**
  ```bash
  npm i
  ```
- [ ] **Step 4: Validar**
  ```bash
  npm test
  npm run build
  npm run wiki:query -- --help
  npm audit --omit=dev
  ```
  Esperado: el bundle de prod ya no incluye estos paquetes (`npm ls --omit=dev gray-matter minisearch node-html-parser` debería marcar `(empty)`); el script `wiki:query` sigue funcionando porque `tsx` y devDeps están disponibles en local.
- [ ] **Step 5: Commit**
  ```
  chore(deps): move wiki-query tooling to devDependencies

  node-html-parser, gray-matter and minisearch are only used by
  scripts/wiki-query/ (a local CLI). Moving them out of runtime
  dependencies shrinks the prod bundle surface and the audit scope.
  ```

**Risk:** si el `bin: { "wiki-query": ... }` se ejecutara desde un consumidor externo del paquete (no es el caso, `private: true`), faltarían deps al instalar. Como el repo es privado y el CLI solo corre internamente con devDeps disponibles, no aplica.

---

### Task 4 (opcional): Mantenimiento de versiones atrasadas

Sin advisories abiertos, pero conviene alinear. **Solo correr si Tasks 1-3 pasaron limpias y hay apetito para un PR de mantenimiento.** Si no, omitir y cerrar el plan ahí.

**Files:**
- Modify: `package.json` (varios)
- Modify: `package-lock.json`

- [ ] **Step 1: Bumpear minors/patches sin riesgo**
  ```bash
  npm i react@latest react-dom@latest \
        zod@latest \
        lucide-react@latest \
        tailwindcss@latest @tailwindcss/postcss@latest \
        @lexical/react@latest lexical@latest
  ```
- [ ] **Step 2: Validar**
  ```bash
  npm audit
  npm run lint
  npm test
  npm run build
  ```
- [ ] **Step 3: Smoke manual**
  Igual que Task 1 step 4: cargar dashboard, abrir un content item, editar un slide (ejercita Lexical), generar slides (ejercita el SSE), exportar PNGs.
- [ ] **Step 4: Commit**
  ```
  chore(deps): bump non-security maintenance updates
  ```

**Risk:** Lexical 0.43 → 0.44 puede traer cambios menores en la API del editor (`src/components/editor/`); validar el editor manualmente. Si rompe, hacer cherry-pick de los bumps que sí son inocuos (react patches, zod, lucide-react, tailwind) y dejar Lexical para un PR aparte.

---

## Validación final del plan

Después de Tasks 1-3 (Task 4 opcional):

```bash
npm audit                    # esperado: found 0 vulnerabilities
npm audit --omit=dev         # esperado: found 0 vulnerabilities
npm run lint
npm test
npm run build
git log --oneline main..HEAD # 3-4 commits, uno por tarea
```

Acceptance criteria:
- `npm audit` → 0 advisories.
- `npm test` y `npm run build` verdes.
- El export de slides (Puppeteer) sigue produciendo el ZIP esperado en una prueba manual.
- `package.json`: `gray-matter`, `minisearch`, `node-html-parser` están en `devDependencies` (si Task 3 corrió).
- Cada bump en su propio commit, con mensaje que cita el GHSA correspondiente cuando aplique.

---

## Execution checklist (orden y paralelización)

Las tareas tocan el mismo `package.json` y `package-lock.json`, así que **deben correr secuencialmente** en este orden:

1. **Task 1** — `next@16.2.4` (cierra 2 moderates). Bloqueante.
2. **Task 2** — `puppeteer@latest` (cierra el high). Bloqueante.
3. **Task 3** — mover deps a `devDependencies`. Independiente de 1 y 2 a nivel funcional, pero conflictúa en lockfile, así que va después.
4. **Task 4** *(opcional)* — mantenimiento. Solo si hay apetito.

No hay paralelizable: todo el plan es serial por tocar el mismo lockfile.

**Recommended execution mode:** inline en sesión actual — son 3 bumps + 1 edit y mucha validación manual. Un subagente no acelera nada y pierde el contexto del smoke test.
