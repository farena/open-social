"use client";

import { useCallback, useState } from "react";
import { ImagePlus, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReferenceImage } from "@/types/carousel";

interface ReferenceImagesProps {
  contentItemId: string;
  images: ReferenceImage[];
  onImagesChange: () => void;
}

export function ReferenceImages({
  contentItemId,
  images,
  onImagesChange,
}: ReferenceImagesProps) {
  const [managerOpen, setManagerOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setManagerOpen(true)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors group"
      >
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <ImagePlus className="h-3 w-3" />
          Reference Images
          <span className="text-[10px] text-muted-foreground/70 tabular-nums">
            ({images.length})
          </span>
        </span>
        <Settings className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
      </button>

      {managerOpen && (
        <ReferenceImagesModal
          contentItemId={contentItemId}
          images={images}
          onClose={() => setManagerOpen(false)}
          onChanged={onImagesChange}
        />
      )}
    </div>
  );
}

interface ReferenceImagesModalProps {
  contentItemId: string;
  images: ReferenceImage[];
  onClose: () => void;
  onChanged: () => void;
}

function ReferenceImagesModal({
  contentItemId,
  images,
  onClose,
  onChanged,
}: ReferenceImagesModalProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

        await fetch(`/api/content/${contentItemId}/references`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: uploadData.url,
            name: file.name,
          }),
        });

        onChanged();
      } catch {
        // ignore
      } finally {
        setUploading(false);
      }
    },
    [contentItemId, onChanged]
  );

  const handleRemove = useCallback(
    async (imageId: string) => {
      await fetch(
        `/api/content/${contentItemId}/references?imageId=${imageId}`,
        { method: "DELETE" }
      );
      onChanged();
    },
    [contentItemId, onChanged]
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
            <h2 className="text-base font-semibold">Reference Images</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The AI studies these to match your visual style — colors, typography, layout.
            </p>
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
          {images.length === 0 ? (
            <div
              onClick={handlePick}
              className="border border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors"
            >
              <ImagePlus className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                Drop reference images here or click to upload
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                PNG, JPG, WebP — max 10MB
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((img) => (
                <div key={img.id} className="oc-enter-pop relative group">
                  <button
                    onClick={() => setPreviewUrl(img.url)}
                    className="block w-full aspect-square rounded-lg overflow-hidden border border-border hover:border-accent transition-colors bg-muted"
                    title={img.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <button
                    onClick={() => handleRemove(img.id)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    aria-label={`Remove ${img.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div
                    className="mt-1.5 text-[11px] text-foreground text-center truncate leading-tight"
                    title={img.name}
                  >
                    {img.name}
                  </div>
                </div>
              ))}
              <button
                onClick={handlePick}
                className="aspect-square rounded-lg border border-dashed border-border flex flex-col items-center justify-center hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors"
                aria-label="Add reference image"
              >
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground mt-1">
                  Add
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            {images.length} {images.length === 1 ? "image" : "images"}
            {uploading && " · uploading…"}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-2xl max-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Reference preview"
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white text-foreground flex items-center justify-center shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
