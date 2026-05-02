"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  contentItemId: string;
  slideId: string;
  elementId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (componentId: string) => void;
}

export function ComponentSaveAsModal({
  contentItemId,
  slideId,
  elementId,
  open,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form when the modal opens
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setTags("");
      setError(null);
      setSuccessId(null);
      setSaving(false);
      // Autofocus the name input after the dialog animates in
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [open]);

  // Auto-dismiss success banner after 4 s
  useEffect(() => {
    if (!successId) return;
    const t = setTimeout(() => {
      setSuccessId(null);
      onClose();
    }, 4000);
    return () => clearTimeout(t);
  }, [successId, onClose]);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);

    try {
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/components/from-element", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentItemId,
          slideId,
          elementId,
          name: name.trim(),
          description: description.trim() || undefined,
          tags: parsedTags.length > 0 ? parsedTags : undefined,
        }),
      });

      if (res.status === 201) {
        const component = await res.json();
        setSuccessId(component.id);
        onSaved?.(component.id);
        return;
      }

      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ?? "Datos inválidos. Revisá los campos."
        );
        return;
      }

      if (res.status === 404) {
        setError("Elemento no encontrado.");
        return;
      }

      setError("Error guardando el componente, intentá de nuevo.");
    } catch {
      setError("Error guardando el componente, intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim() && !saving) {
      handleSave();
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
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface border border-border p-6 shadow-2xl"
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-sm font-semibold">
              Save as component
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

          {/* Success banner */}
          {successId && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-xs text-green-800 flex items-center justify-between gap-2">
              <span>
                Component saved ·{" "}
                <a
                  href="/components"
                  className="underline font-medium hover:opacity-80"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View in library
                </a>
              </span>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            <FormField label="Name *">
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Component name"
                className="w-full text-sm border border-border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40"
                disabled={saving}
              />
            </FormField>

            <FormField label="Description">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full text-sm border border-border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40"
                disabled={saving}
              />
            </FormField>

            <FormField label="Tags">
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Comma-separated tags"
                className="w-full text-sm border border-border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40"
                disabled={saving}
              />
            </FormField>

            {error && (
              <p className={cn("text-xs text-red-600 leading-tight")}>{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close asChild>
              <Button variant="outline" size="sm" disabled={saving}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              size="sm"
              variant="default"
              onClick={handleSave}
              disabled={!name.trim() || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
