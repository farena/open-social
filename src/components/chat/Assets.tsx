"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Folder, Library, Plus, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/types/asset";

type Scope = "carousel" | "library";

interface AssetsProps {
  scope: Scope;
  carouselId?: string;       // required when scope === "carousel"
  onAssetsChanged?: () => void;
}

export function Assets({ scope, carouselId, onAssetsChanged }: AssetsProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);

  const baseUrl =
    scope === "library"
      ? "/api/assets"
      : `/api/content/${carouselId}/assets`; // TODO: rename prop carouselId → contentItemId

  const refresh = useCallback(async () => {
    if (scope === "carousel" && !carouselId) return;
    try {
      const res = await fetch(baseUrl);
      if (!res.ok) return;
      const data = await res.json();
      setAssets(data.assets ?? []);
    } catch {
      // ignore
    }
  }, [baseUrl, scope, carouselId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setAssets runs after await, not in commit phase
    refresh();
  }, [refresh]);

  const Icon = scope === "library" ? Library : Folder;
  const label = scope === "library" ? "Library" : "Carousel assets";

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setManagerOpen(true)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors group"
      >
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3 w-3" />
          {label}
          <span className="text-[10px] text-muted-foreground/70 tabular-nums">
            ({assets.length})
          </span>
        </span>
        <Settings className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
      </button>

      {managerOpen && (
        <AssetManagerModal
          scope={scope}
          baseUrl={baseUrl}
          assets={assets}
          onClose={() => setManagerOpen(false)}
          onChanged={async () => {
            await refresh();
            onAssetsChanged?.();
          }}
        />
      )}
    </div>
  );
}

interface AssetManagerModalProps {
  scope: Scope;
  baseUrl: string;
  assets: Asset[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

function AssetManagerModal({
  scope,
  baseUrl,
  assets,
  onClose,
  onChanged,
}: AssetManagerModalProps) {
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);

  const title = scope === "library" ? "Library" : "Carousel assets";
  const subtitle =
    scope === "library"
      ? "Reusable images available across every carousel."
      : "Images attached to this carousel only.";

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) return;
        const uploadData = await uploadRes.json();

        const created = await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: uploadData.url,
            name: file.name.replace(/\.[^.]+$/, ""),
          }),
        });

        if (created.ok) {
          const newAsset = (await created.json()) as Asset;
          await onChanged();
          setEditing(newAsset);
        }
      } catch {
        // ignore
      } finally {
        setUploading(false);
      }
    },
    [baseUrl, onChanged]
  );

  const handleRemove = useCallback(
    async (id: string) => {
      await fetch(`${baseUrl}/${id}`, { method: "DELETE" });
      await onChanged();
    },
    [baseUrl, onChanged]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) handleUpload(file);
    },
    [handleUpload]
  );

  const handlePick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleUpload(file);
    };
    input.click();
  }, [handleUpload]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="relative bg-background rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-muted text-foreground flex items-center justify-center hover:bg-muted/70 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex-1 overflow-y-auto"
        >
          {assets.length === 0 ? (
            <div
              onClick={handlePick}
              className="border border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors"
            >
              <Plus className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                Drop images here or click to upload
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                PNG, JPG, WebP — max 10MB
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {assets.map((asset) => (
                <div key={asset.id} className="oc-enter-pop relative group">
                  <button
                    onClick={() => setEditing(asset)}
                    className="block w-full aspect-square rounded-lg overflow-hidden border border-border hover:border-accent transition-colors bg-muted"
                    title="Click to rename"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <button
                    onClick={() => handleRemove(asset.id)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    aria-label={`Remove ${asset.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div
                    className="mt-1.5 text-[11px] text-foreground text-center truncate leading-tight"
                    title={asset.name}
                  >
                    {asset.name}
                  </div>
                </div>
              ))}
              <button
                onClick={handlePick}
                className="aspect-square rounded-lg border border-dashed border-border flex flex-col items-center justify-center hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors"
                aria-label="Add asset"
              >
                <Plus className="h-5 w-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground mt-1">
                  Add
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            {assets.length} {assets.length === 1 ? "asset" : "assets"}
            {uploading && " · uploading…"}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>

      {editing && (
        <AssetEditor
          asset={editing}
          baseUrl={baseUrl}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await onChanged();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface AssetEditorProps {
  asset: Asset;
  baseUrl: string;
  onClose: () => void;
  onSaved: () => void;
}

function AssetEditor({ asset, baseUrl, onClose, onSaved }: AssetEditorProps) {
  const [name, setName] = useState(asset.name);
  const [description, setDescription] = useState(asset.description ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${baseUrl}/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="relative bg-background rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white text-foreground flex items-center justify-center shadow-lg"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex gap-3">
          <div className="w-24 h-24 rounded-lg overflow-hidden border border-border bg-muted shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.url}
              alt={asset.name}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              URL
            </label>
            <div className="flex gap-1.5 items-center">
              <code className="flex-1 text-[11px] bg-muted rounded px-2 py-1 truncate">
                {asset.url}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 w-7 p-0 shrink-0"
                aria-label="Copy URL"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Name (use this to reference the asset in chat)
          </label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onClose();
            }}
            className="w-full text-sm bg-muted/40 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Description (helps the AI know when to use it)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="e.g. Transparent brand logo, use on dark backgrounds"
            className="w-full text-sm bg-muted/40 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
