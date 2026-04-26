"use client";

import { Bookmark, Grid3X3, Maximize2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AspectRatioSelector } from "./AspectRatioSelector";
import { ExportButton } from "./ExportButton";
import type { AspectRatio } from "@/types/carousel";

interface ToolbarProps {
  aspectRatio: AspectRatio;
  onAspectChange: (ratio: AspectRatio) => void;
  showSafeZones: boolean;
  onToggleSafeZones: () => void;
  onFullscreen: () => void;
  onSaveTemplate: () => void;
  onDeleteCarousel: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  carouselId: string;
  slideCount: number;
}

/**
 * Top strip above the canvas: aspect ratio, fullscreen, safe zones, save as
 * template, delete carousel, chat toggle, export.
 */
export function Toolbar({
  aspectRatio,
  onAspectChange,
  showSafeZones,
  onToggleSafeZones,
  onFullscreen,
  onSaveTemplate,
  onDeleteCarousel,
  chatOpen,
  onToggleChat,
  carouselId,
  slideCount,
}: ToolbarProps) {
  return (
    <div className="h-11 border-b border-border bg-surface flex items-center px-4 gap-3 shrink-0">
      <AspectRatioSelector value={aspectRatio} onChange={onAspectChange} />
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onFullscreen}
        className="text-muted-foreground"
        aria-label="Fullscreen preview"
        title="Fullscreen preview"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={showSafeZones ? "outline" : "ghost"}
        size="sm"
        onClick={onToggleSafeZones}
        className={
          showSafeZones
            ? "border-accent text-accent"
            : "text-muted-foreground"
        }
        aria-label="Toggle safe zones"
        title="Instagram safe zones"
      >
        <Grid3X3 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSaveTemplate}
        className="text-muted-foreground"
        aria-label="Save as template"
        title="Save as template"
      >
        <Bookmark className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDeleteCarousel}
        className="text-muted-foreground hover:text-destructive"
        aria-label="Delete carousel"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <button
        onClick={onToggleChat}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-muted"
      >
        {chatOpen ? "Hide Chat" : "Show Chat"}
      </button>
      <ExportButton carouselId={carouselId} slideCount={slideCount} />
    </div>
  );
}
