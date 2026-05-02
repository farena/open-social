"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { ParametersMetadataEditor } from "./ParametersMetadataEditor";
import { ComponentPreview } from "./ComponentPreview";
import { extractParameterKeys } from "@/lib/component-interpolation";
import type { Component, ComponentParameter } from "@/types/component";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  initial?: Component;
}

// ---------------------------------------------------------------------------
// Schema reconciliation
// ---------------------------------------------------------------------------

function reconcileSchema(
  html: string,
  css: string,
  existing: ComponentParameter[],
): ComponentParameter[] {
  const keys = extractParameterKeys(html, css);
  const byKey = new Map(existing.map((p) => [p.key, p]));
  return keys.map((key) => byKey.get(key) ?? { key, type: "text" as const });
}

// ---------------------------------------------------------------------------
// ComponentEditor
// ---------------------------------------------------------------------------

export function ComponentEditor({ initial }: Props) {
  const router = useRouter();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [width, setWidth] = useState(initial?.width ?? 400);
  const [height, setHeight] = useState(initial?.height ?? 300);
  const [htmlContent, setHtmlContent] = useState(initial?.htmlContent ?? "");
  const [scssStyles, setScssStyles] = useState(initial?.scssStyles ?? "");
  const [parametersSchema, setParametersSchema] = useState<ComponentParameter[]>(
    initial?.parametersSchema ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync schema whenever HTML/CSS changes
  const handleHtmlChange = useCallback(
    (val: string) => {
      setHtmlContent(val);
      setParametersSchema((prev) => reconcileSchema(val, scssStyles, prev));
    },
    [scssStyles],
  );

  const handleScssChange = useCallback(
    (val: string) => {
      setScssStyles(val);
      setParametersSchema((prev) => reconcileSchema(htmlContent, val, prev));
    },
    [htmlContent],
  );

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const body = {
        name,
        description: description || null,
        htmlContent,
        scssStyles,
        parametersSchema,
        width,
        height,
        tags: parsedTags,
      };

      const url = initial
        ? `/api/components/${initial.id}`
        : "/api/components";
      const method = initial ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        setError(`Error ${res.status}: ${text}`);
        return;
      }

      router.push("/components");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 min-h-0 flex-1 overflow-hidden">
      {/* ---- Left column: form (scrollable) ---- */}
      <div className="flex flex-col gap-5 w-full lg:w-[420px] shrink-0 overflow-y-auto pr-1">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 text-sm px-4 py-2 rounded bg-foreground text-background font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? "Saving…" : "Save component"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/components")}
            className="px-4 py-2 rounded border border-border text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-600 leading-tight">{error}</p>
        )}

        <FormField label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My component"
            className="w-full text-sm border border-border rounded px-3 py-1.5"
          />
        </FormField>

        <FormField label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            className="w-full text-sm border border-border rounded px-3 py-1.5 resize-none"
          />
        </FormField>

        <FormField label="Tags (comma-separated)">
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="button, card, header"
            className="w-full text-sm border border-border rounded px-3 py-1.5"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Width (px)">
            <input
              type="number"
              value={width}
              min={1}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (Number.isFinite(v) && v > 0) setWidth(v);
              }}
              className="w-full text-sm border border-border rounded px-3 py-1.5"
            />
          </FormField>
          <FormField label="Height (px)">
            <input
              type="number"
              value={height}
              min={1}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (Number.isFinite(v) && v > 0) setHeight(v);
              }}
              className="w-full text-sm border border-border rounded px-3 py-1.5"
            />
          </FormField>
        </div>

        <FormField label="Component HTML">
          <CodeEditor
            value={htmlContent}
            language="html"
            height={200}
            onChange={handleHtmlChange}
          />
        </FormField>

        <FormField label="Styles (SCSS)">
          <CodeEditor
            value={scssStyles}
            language="scss"
            height={160}
            onChange={handleScssChange}
          />
        </FormField>

        <FormField label="Parameters">
          <ParametersMetadataEditor
            parameters={parametersSchema}
            onChange={setParametersSchema}
          />
        </FormField>

      </div>

      {/* ---- Right column: preview ---- */}
      <ComponentPreview
        htmlContent={htmlContent}
        scssStyles={scssStyles}
        parametersSchema={parametersSchema}
        width={width}
        height={height}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
