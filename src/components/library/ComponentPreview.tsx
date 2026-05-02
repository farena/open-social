"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  extractFontFamilies,
  buildGoogleFontsFamilyParam,
  extractCssImports,
} from "@/lib/slide-html";
import { interpolate } from "@/lib/component-interpolation";
import { cn } from "@/lib/utils";
import type { ComponentParameter } from "@/types/component";

// ---------------------------------------------------------------------------
// Local wrap helper (mirrors component-thumbnail.ts — no AspectRatio needed)
// ---------------------------------------------------------------------------

function wrapComponentHtml(
  html: string,
  css: string,
  width: number,
  height: number,
  previewBg: string,
): string {
  const combined = html + css;
  const fontFamilies = extractFontFamilies(combined);
  let fontBlock = "";
  if (fontFamilies.length > 0) {
    const params = fontFamilies.map(buildGoogleFontsFamilyParam).join("&");
    fontBlock = `<link href="https://fonts.googleapis.com/css2?${params}&display=swap" rel="stylesheet">`;
  }

  const safeCss = (css ?? "").replace(/<\/style/gi, "");
  const { imports, body: cssBody } = extractCssImports(safeCss);
  const importBlock = imports ? imports + "\n" : "";
  // The preview-only background is set on `html` so the user's CSS on `body`
  // (interpolated via `body { ... }`) can override it explicitly when needed.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1">
  ${fontBlock}
  <style>
    ${importBlock}* { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    html { background: ${previewBg}; }
    body { ${cssBody} }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

function buildDefaultParams(
  schema: ComponentParameter[],
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const p of schema) {
    params[p.key] = p.defaultValue ?? "";
  }
  return params;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ComponentPreviewProps {
  htmlContent: string;
  scssStyles: string;
  parametersSchema: ComponentParameter[];
  width: number;
  height: number;
}

const BG_PRESETS: { label: string; value: string }[] = [
  { label: "White", value: "#ffffff" },
  { label: "Light", value: "#f3f4f6" },
  { label: "Dark", value: "#1a1a1a" },
  { label: "Black", value: "#000000" },
];

const PREVIEW_BG_STORAGE_KEY = "oc:component-preview-bg";
const DEFAULT_PREVIEW_BG = "#ffffff";

// Module-level pub-sub so multiple ComponentPreview instances stay in sync
// when one of them changes the persisted value.
const previewBgListeners = new Set<() => void>();

function subscribePreviewBg(cb: () => void): () => void {
  previewBgListeners.add(cb);
  return () => {
    previewBgListeners.delete(cb);
  };
}

function getPreviewBgSnapshot(): string {
  if (typeof window === "undefined") return DEFAULT_PREVIEW_BG;
  const stored = window.localStorage.getItem(PREVIEW_BG_STORAGE_KEY);
  // Accept any string the user previously stored (presets or hex from the
  // color picker). Reject obviously invalid values to avoid breaking CSS.
  if (stored && /^#[0-9a-fA-F]{3,8}$/.test(stored)) return stored;
  return DEFAULT_PREVIEW_BG;
}

function getPreviewBgServerSnapshot(): string {
  return DEFAULT_PREVIEW_BG;
}

function persistPreviewBg(value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREVIEW_BG_STORAGE_KEY, value);
  for (const cb of previewBgListeners) cb();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComponentPreview({
  htmlContent,
  scssStyles,
  parametersSchema,
  width,
  height,
}: ComponentPreviewProps) {
  // Persisted to localStorage. useSyncExternalStore returns the default on
  // SSR and the real stored value on the client without hydration warnings.
  const previewBg = useSyncExternalStore(
    subscribePreviewBg,
    getPreviewBgSnapshot,
    getPreviewBgServerSnapshot,
  );
  const setPreviewBg = persistPreviewBg;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageDims, setStageDims] = useState<{ w: number; h: number } | null>(
    null,
  );

  const measure = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setStageDims({ w: rect.width, h: rect.height });
    }
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => measure());
    obs.observe(el);
    measure();
    return () => obs.disconnect();
  }, [measure]);

  const compW = width || 400;
  const compH = height || 300;

  // Scale to fit available stage area; cap at 1 so small components show at
  // their natural size instead of being upscaled (which looks blurry/wrong).
  const scale = stageDims
    ? Math.min(1, stageDims.w / compW, stageDims.h / compH)
    : 0;
  const scaledW = Math.floor(compW * scale);
  const scaledH = Math.floor(compH * scale);

  const srcDoc = useMemo(() => {
    const params = buildDefaultParams(parametersSchema);
    const interpolatedHtml = interpolate(htmlContent, params);
    const interpolatedCss = interpolate(scssStyles, params);
    return wrapComponentHtml(
      interpolatedHtml,
      interpolatedCss,
      compW,
      compH,
      previewBg,
    );
  }, [htmlContent, scssStyles, parametersSchema, compW, compH, previewBg]);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Preview
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Background
          </span>
          {BG_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setPreviewBg(preset.value)}
              title={preset.label}
              aria-label={preset.label}
              className={cn(
                "h-5 w-5 rounded-full border transition-all",
                previewBg === preset.value
                  ? "border-accent ring-2 ring-accent/40"
                  : "border-border hover:border-accent/50",
              )}
              style={{ background: preset.value }}
            />
          ))}
          <input
            type="color"
            value={previewBg}
            onChange={(e) => setPreviewBg(e.target.value)}
            title="Custom color"
            aria-label="Custom background color"
            className="h-5 w-5 rounded-full border border-border cursor-pointer overflow-hidden p-0"
          />
        </div>
      </div>
      <div
        ref={stageRef}
        className="border border-border rounded-lg overflow-hidden flex-1 min-h-0 flex items-center justify-center"
        style={{ background: previewBg }}
      >
        {scale > 0 && (
          <div
            style={{
              width: scaledW,
              height: scaledH,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <iframe
              sandbox=""
              srcDoc={srcDoc}
              title="Component preview"
              style={{
                width: compW,
                height: compH,
                border: "none",
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                position: "absolute",
                top: 0,
                left: 0,
                display: "block",
              }}
            />
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug shrink-0">
        Parameters are shown with their default values. The background is
        preview-only and not part of the component.
      </p>
    </div>
  );
}
