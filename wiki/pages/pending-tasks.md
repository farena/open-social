---
title: Pending tasks
type: backlog
code_refs: []
sources: []
related: []
created: 2026-05-01
updated: 2026-05-01
confidence: high
---

# Pending tasks

Backlog de trabajo planificado que todavía no se ejecutó. Cada entrada apunta al plan o issue donde vive el detalle. Cuando una tarea se complete, moverla a un commit/PR y borrarla de esta página (o dejar una línea histórica si la decisión amerita ingestarse al wiki como `source`).

## Open

### Dependency security fixes — `docs/plans/2026-05-01-dependency-security-fixes.md`

- **Origen:** `/security-review` ejecutado el 2026-05-01.
- **Estado:** plan escrito, sin ejecutar.
- **Resumen:** llevar `npm audit` a 0 cerrando 3 advisories (1 HIGH `basic-ftp` GHSA-rp42-5vxx-qpwr vía `puppeteer`, 2 MODERATE `postcss` GHSA-qx2v-qp2m-jg93 vía `next@16.2.3`) y mover `gray-matter` / `minisearch` / `node-html-parser` a `devDependencies` (solo se usan en `scripts/wiki-query/`).
- **Pasos:** bump `next@16.2.4` + `eslint-config-next@16.2.4` → bump `puppeteer@latest` → reubicar deps de tooling. Validar con `npm audit`, `npm test`, `npm run build` y smoke manual del export de PNGs (Puppeteer es la única dep con superficie real de runtime tocada).
- **Riesgo principal:** bump de `puppeteer` puede requerir ajuste en `src/lib/export-slides.ts:23` si `puppeteer.launch()` cambió API.
