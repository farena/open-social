"use client";

import {
  Box,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { SlideElement } from "@/types/slide-model";
import type { SlideEditorAction } from "./useSlideEditor";

interface LayersPanelProps {
  elements: SlideElement[];
  selection: string | null;
  dispatch: (action: SlideEditorAction) => void;
}

export function LayersPanel({ elements, selection, dispatch }: LayersPanelProps) {
  // Top of stack first (Photoshop convention). The data array is bottom-first.
  const ordered = [...elements].reverse();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromTop = ordered.findIndex((el) => el.id === active.id);
    const toTop = ordered.findIndex((el) => el.id === over.id);
    if (fromTop === -1 || toTop === -1) return;
    // Display index is reversed; convert back to bottom-first index.
    const toBottom = elements.length - 1 - toTop;
    dispatch({
      type: "MOVE_TO_INDEX",
      elementId: String(active.id),
      toIndex: toBottom,
    });
  };

  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        Layers
      </h4>
      {ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No elements yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={ordered.map((el) => el.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-0.5">
              {ordered.map((el) => (
                <LayerRow
                  key={el.id}
                  element={el}
                  selected={selection === el.id}
                  dispatch={dispatch}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function LayerRow({
  element,
  selected,
  dispatch,
}: {
  element: SlideElement;
  selected: boolean;
  dispatch: (action: SlideEditorAction) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hidden = element.hidden === true;

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-layer-id={element.id}
      data-selected={selected || undefined}
      onClick={() => dispatch({ type: "SELECT", elementId: element.id })}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors",
        selected
          ? "bg-muted ring-1 ring-border"
          : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label={hidden ? "Show layer" : "Hide layer"}
        title={hidden ? "Show layer" : "Hide layer"}
        onClick={(e) => {
          e.stopPropagation();
          dispatch({ type: "TOGGLE_VISIBILITY", elementId: element.id });
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        {hidden ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      <LayerIcon element={element} />
      <span
        className={cn(
          "flex-1 truncate",
          hidden && "text-muted-foreground line-through",
        )}
      >
        {layerLabel(element)}
      </span>
    </li>
  );
}

function LayerIcon({ element }: { element: SlideElement }) {
  const className = "h-3.5 w-3.5 text-muted-foreground shrink-0";
  if (element.kind === "image") return <ImageIcon className={className} />;
  return <Box className={className} />;
}

function layerLabel(el: SlideElement): string {
  if (el.kind === "image") {
    const file = el.src.split("/").pop();
    return file ? truncate(file, 28) : "Image";
  }
  // container: extract first chunk of text from htmlContent (strip tags),
  // or fall back to a shortened scssStyles preview.
  const stripped = (el.htmlContent ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length > 0) return truncate(stripped, 28);
  const css = (el.scssStyles ?? "").replace(/\s+/g, " ").trim();
  return css.length > 0 ? truncate(css, 28) : "Container";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
