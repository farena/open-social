"use client";

import { cn } from "@/lib/utils";
import type { Component } from "@/types/component";

interface ComponentPickerCardProps {
  component: Component;
  isInserting: boolean;
  disabled: boolean;
  onInsert: (component: Component) => void;
}

/**
 * Thumbnail-only card for ComponentInsertModal. No edit/delete/duplicate —
 * clicking the card inserts it into the active slide.
 */
export function ComponentPickerCard({
  component,
  isInserting,
  disabled,
  onInsert,
}: ComponentPickerCardProps) {
  const aspectRatio =
    component.width && component.height
      ? component.width / component.height
      : 1;

  return (
    <button
      type="button"
      onClick={() => onInsert(component)}
      disabled={disabled}
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-surface overflow-hidden text-left",
        "hover:border-accent/60 hover:shadow-sm transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        disabled && !isInserting && "opacity-50 cursor-not-allowed",
        isInserting && "opacity-70 cursor-wait",
      )}
    >
      {/* Thumbnail */}
      <div
        className="w-full bg-muted flex items-center justify-center overflow-hidden shrink-0 relative"
        style={{ aspectRatio }}
      >
        {component.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={component.thumbnailUrl}
            alt={component.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 p-4 text-center w-full h-full">
            <span className="text-2xl font-bold text-muted-foreground/30 select-none">
              &lt;/&gt;
            </span>
            <span className="text-xs text-muted-foreground/50 leading-tight">
              {component.width}×{component.height}
            </span>
          </div>
        )}

        {/* Insert overlay on hover */}
        {!isInserting && !disabled && (
          <div className="absolute inset-0 bg-accent/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-xs font-semibold text-accent bg-white/90 rounded-md px-2.5 py-1 shadow-sm">
              Insertar
            </span>
          </div>
        )}

        {isInserting && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="px-2.5 py-2">
        <p className="text-xs font-semibold leading-snug truncate text-foreground">
          {component.name}
        </p>
      </div>
    </button>
  );
}
