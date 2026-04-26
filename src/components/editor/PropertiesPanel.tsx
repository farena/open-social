"use client";

import { X } from "lucide-react";
import {
  createContainerElement,
  createImageElement,
} from "@/lib/slide-defaults";
import type { Slide } from "@/types/carousel";
import type {
  BackgroundElement,
  ContainerElement,
  ImageElement,
} from "@/types/slide-model";
import { LayersPanel } from "./LayersPanel";
import type { SlideEditorAction } from "./useSlideEditor";

interface PropertiesPanelProps {
  slide: Slide;
  selection: string | null;
  dispatch: (action: SlideEditorAction) => void;
  onClose?: () => void;
}

/**
 * Right-rail editor panel. Always shows the Layers list. Below it: contextual
 * controls for the selected element (htmlContent + scssStyles for containers,
 * src + scssStyles for images), or background controls + add-element menu
 * when nothing is selected.
 */
export function PropertiesPanel({
  slide,
  selection,
  dispatch,
  onClose,
}: PropertiesPanelProps) {
  const selected = selection
    ? slide.elements.find((el) => el.id === selection) ?? null
    : null;

  return (
    <aside className="w-[340px] shrink-0 bg-white flex flex-col h-full overflow-y-auto border-l border-border">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold">
          {selected
            ? `${capitalize(selected.kind)} properties`
            : "Slide properties"}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label="Close panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 px-5 pb-6 space-y-6">
        <LayersPanel
          elements={slide.elements}
          selection={selection}
          dispatch={dispatch}
        />

        {!selected && (
          <>
            <BackgroundControls
              background={slide.background}
              onChange={(bg) =>
                dispatch({ type: "SET_BACKGROUND", background: bg })
              }
            />
            <AddElementMenu dispatch={dispatch} />
          </>
        )}

        {selected?.kind === "container" && (
          <ContainerControls element={selected} dispatch={dispatch} />
        )}
        {selected?.kind === "image" && (
          <ImageControls element={selected} dispatch={dispatch} />
        )}

        {selected && (
          <>
            <ScssStylesControls element={selected} dispatch={dispatch} />
            <CommonElementControls element={selected} dispatch={dispatch} />
          </>
        )}
      </div>
    </aside>
  );
}

// ---------- background ----------

function BackgroundControls({
  background,
  onChange,
}: {
  background: BackgroundElement;
  onChange: (bg: BackgroundElement) => void;
}) {
  return (
    <Section title="Background">
      <div className="flex gap-2 mb-2">
        <Tab
          active={background.kind === "solid"}
          onClick={() => onChange({ kind: "solid", color: "#ffffff" })}
        >
          Color
        </Tab>
        <Tab
          active={background.kind === "gradient"}
          onClick={() =>
            onChange({
              kind: "gradient",
              angle: 135,
              stops: [
                { offset: 0, color: "#2fd9b0" },
                { offset: 1, color: "#00c4ee" },
              ],
            })
          }
        >
          Gradient
        </Tab>
        <Tab
          active={background.kind === "image"}
          onClick={() =>
            onChange({
              kind: "image",
              src: background.kind === "image" ? background.src : "",
              fit: "cover",
            })
          }
        >
          Image
        </Tab>
      </div>

      {background.kind === "solid" && (
        <Field label="Color">
          <ColorInput
            value={background.color}
            onChange={(color) => onChange({ kind: "solid", color })}
          />
        </Field>
      )}

      {background.kind === "gradient" && (
        <>
          <Field label="Angle (deg)">
            <NumberInput
              value={background.angle}
              onChange={(angle) => onChange({ ...background, angle })}
            />
          </Field>
          <Field label="From">
            <ColorInput
              value={background.stops[0].color}
              onChange={(color) =>
                onChange({
                  ...background,
                  stops: background.stops.map((s, i) =>
                    i === 0 ? { ...s, color } : s
                  ),
                })
              }
            />
          </Field>
          <Field label="To">
            <ColorInput
              value={background.stops[background.stops.length - 1].color}
              onChange={(color) =>
                onChange({
                  ...background,
                  stops: background.stops.map((s, i) =>
                    i === background.stops.length - 1 ? { ...s, color } : s
                  ),
                })
              }
            />
          </Field>
        </>
      )}

      {background.kind === "image" && (
        <>
          <Field label="Source">
            <TextInput
              value={background.src}
              placeholder="/uploads/image.jpg"
              onChange={(src) => onChange({ ...background, src })}
            />
          </Field>
          <Field label="Fit">
            <SelectInput
              value={background.fit}
              options={[
                { value: "cover", label: "Cover" },
                { value: "contain", label: "Contain" },
              ]}
              onChange={(fit) =>
                onChange({ ...background, fit: fit as "cover" | "contain" })
              }
            />
          </Field>
        </>
      )}
    </Section>
  );
}

function AddElementMenu({
  dispatch,
}: {
  dispatch: (action: SlideEditorAction) => void;
}) {
  const addContainer = () => {
    dispatch({
      type: "ADD_ELEMENT",
      element: createContainerElement({ x: 100, y: 100 }),
    });
  };
  const addImage = () => {
    dispatch({
      type: "ADD_ELEMENT",
      element: createImageElement({
        src: "/uploads/placeholder.png",
        x: 100,
        y: 100,
      }),
    });
  };

  return (
    <Section title="Add element">
      <div className="grid grid-cols-2 gap-2">
        <ActionButton onClick={addContainer}>Container</ActionButton>
        <ActionButton onClick={addImage}>Image</ActionButton>
      </div>
    </Section>
  );
}

// ---------- container ----------

function ContainerControls({
  element,
  dispatch,
}: {
  element: ContainerElement;
  dispatch: (action: SlideEditorAction) => void;
}) {
  return (
    <Section title="HTML content">
      <textarea
        value={element.htmlContent}
        onChange={(e) =>
          dispatch({
            type: "PATCH_ELEMENT",
            elementId: element.id,
            patch: { htmlContent: e.target.value } as Partial<ContainerElement>,
          })
        }
        rows={8}
        spellCheck={false}
        placeholder='<h1 class="title">Hola mundo</h1>'
        className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 resize-y leading-snug"
      />
    </Section>
  );
}

// ---------- image ----------

function ImageControls({
  element,
  dispatch,
}: {
  element: ImageElement;
  dispatch: (action: SlideEditorAction) => void;
}) {
  return (
    <Section title="Image source">
      <Field label="src">
        <TextInput
          value={element.src}
          placeholder="/uploads/photo.jpg"
          onChange={(src) =>
            dispatch({
              type: "PATCH_ELEMENT",
              elementId: element.id,
              patch: { src } as Partial<ImageElement>,
            })
          }
        />
      </Field>
    </Section>
  );
}

// ---------- scssStyles (raw CSS with native nesting) ----------

function ScssStylesControls({
  element,
  dispatch,
}: {
  element: ContainerElement | ImageElement;
  dispatch: (action: SlideEditorAction) => void;
}) {
  return (
    <Section title="SCSS styles">
      <textarea
        value={element.scssStyles ?? ""}
        onChange={(e) =>
          dispatch({
            type: "PATCH_ELEMENT",
            elementId: element.id,
            patch: { scssStyles: e.target.value },
          })
        }
        rows={8}
        spellCheck={false}
        placeholder={
          "color: white; background: navy;\n& h1 { font-size: 96px; font-weight: 900; }\n& .pill { padding: 6px 16px; border-radius: 999px; }"
        }
        className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 resize-y leading-snug"
      />
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
        Native CSS with nesting (<code>&amp;</code> selectors). Scoped to this
        element via <code>[data-element-id]</code>.
      </p>
    </Section>
  );
}

// ---------- common (position/size/delete) ----------

function CommonElementControls({
  element,
  dispatch,
}: {
  element: ContainerElement | ImageElement;
  dispatch: (action: SlideEditorAction) => void;
}) {
  return (
    <Section title="Position & size">
      <div className="grid grid-cols-2 gap-2">
        <Field label="X">
          <NumberInput
            value={element.position.x}
            onChange={(x) =>
              dispatch({
                type: "PATCH_ELEMENT",
                elementId: element.id,
                patch: { position: { ...element.position, x } },
              })
            }
          />
        </Field>
        <Field label="Y">
          <NumberInput
            value={element.position.y}
            onChange={(y) =>
              dispatch({
                type: "PATCH_ELEMENT",
                elementId: element.id,
                patch: { position: { ...element.position, y } },
              })
            }
          />
        </Field>
        <Field label="W">
          <NumberInput
            value={element.size.w}
            onChange={(w) =>
              dispatch({
                type: "PATCH_ELEMENT",
                elementId: element.id,
                patch: { size: { ...element.size, w } },
              })
            }
          />
        </Field>
        <Field label="H">
          <NumberInput
            value={element.size.h}
            onChange={(h) =>
              dispatch({
                type: "PATCH_ELEMENT",
                elementId: element.id,
                patch: { size: { ...element.size, h } },
              })
            }
          />
        </Field>
      </div>
      <button
        onClick={() =>
          dispatch({ type: "DELETE_ELEMENT", elementId: element.id })
        }
        className="w-full mt-2 text-xs text-destructive hover:bg-destructive/10 border border-destructive/30 rounded py-1.5"
      >
        Delete element
      </button>
    </Section>
  );
}

// ---------- primitives ----------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="block text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

function Tab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-xs px-2 py-1 rounded border ${
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-white text-foreground border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs py-2 rounded border border-border hover:bg-muted transition-colors"
    >
      {children}
    </button>
  );
}

function TextInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm border border-border rounded px-2 py-1"
    />
  );
}

function NumberInput({
  value,
  step = 1,
  onChange,
}: {
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-full text-sm border border-border rounded px-2 py-1"
    />
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value.length === 7 ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-border cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-sm border border-border rounded px-2 py-1 font-mono"
      />
    </div>
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm border border-border rounded px-2 py-1 bg-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
