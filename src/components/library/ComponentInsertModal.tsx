"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ComponentPickerCard } from "./ComponentPickerCard";
import type { Component, ComponentParameter } from "@/types/component";

interface Props {
  contentItemId: string;
  slideId: string;
  open: boolean;
  onClose: () => void;
  onInserted?: (elementId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultsFromSchema(schema: ComponentParameter[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const p of schema) {
    result[p.key] = p.defaultValue ?? "";
  }
  return result;
}

function typesFromSchema(schema: ComponentParameter[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const p of schema) {
    result[p.key] = p.type;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function ComponentInsertModal({
  contentItemId,
  slideId,
  open,
  onClose,
  onInserted,
}: Props) {
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inserting, setInserting] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Fetch components list whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveTags([]);
    setError(null);
    setInserting(null);

    let cancelled = false;
    setLoading(true);
    fetch("/api/components")
      .then((res) => {
        if (!res.ok) throw new Error("Error loading the library.");
        return res.json() as Promise<{ components: Component[] }>;
      })
      .then((data) => {
        if (!cancelled) setComponents(data.components);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the library. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // All unique tags across loaded components
  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const c of components) {
      for (const tag of c.tags) {
        if (!seen.has(tag)) { seen.add(tag); tags.push(tag); }
      }
    }
    return tags;
  }, [components]);

  const toggleTag = (tag: string) =>
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return components.filter((c) => {
      if (q) {
        const haystack = [c.name, c.description ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (activeTags.length > 0 && !activeTags.every((t) => c.tags.includes(t)))
        return false;
      return true;
    });
  }, [components, query, activeTags]);

  const handleInsert = async (component: Component) => {
    if (inserting) return;
    setInserting(component.id);
    setError(null);

    try {
      const body = {
        kind: "container" as const,
        position: { x: 0, y: 0 },
        size: { w: component.width, h: component.height },
        htmlContent: component.htmlContent,
        scssStyles: component.scssStyles,
        parameters: defaultsFromSchema(component.parametersSchema),
        parameterTypes: typesFromSchema(component.parametersSchema),
      };

      const res = await fetch(
        `/api/content/${contentItemId}/slides/${slideId}/elements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (res.status === 201 || res.status === 200) {
        const data = await res.json();
        const newElementId: string | undefined = data?.element?.id;
        if (newElementId) onInserted?.(newElementId);
        onClose();
        return;
      }

      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ?? "Datos inválidos al insertar el componente.",
        );
        return;
      }

      setError(
        res.status === 404
          ? "Slide no encontrado."
          : "Error al insertar el componente, intentá de nuevo.",
      );
    } catch {
      setError("Error al insertar el componente, intentá de nuevo.");
    } finally {
      setInserting(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-oc-overlay
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        />
        <Dialog.Content
          data-oc-dialog
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface border border-border p-6 shadow-2xl flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <Dialog.Title className="text-sm font-semibold">
              Insert component
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Search */}
          <div className="shrink-0 mb-3">
            <Input
              type="search"
              placeholder="Search components…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Tag chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 shrink-0">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer",
                    activeTags.includes(tag)
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-surface text-muted-foreground border-border hover:border-accent/50 hover:text-foreground",
                  )}
                >
                  {tag}
                </button>
              ))}
              {activeTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTags([])}
                  className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Inline error */}
          {error && (
            <p className="text-xs text-red-600 leading-tight mb-3 shrink-0">{error}</p>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                {components.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      No components in the library yet.
                    </p>
                    <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                      Create one from a container or at{" "}
                      <a
                        href="/components/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-80"
                      >
                        /components/new
                      </a>
                      .
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No matching components.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {filtered.map((component) => (
                  <ComponentPickerCard
                    key={component.id}
                    component={component}
                    isInserting={inserting === component.id}
                    disabled={!!inserting}
                    onInsert={handleInsert}
                  />
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
