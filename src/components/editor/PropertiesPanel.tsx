"use client";

import { X } from "lucide-react";
import {
  createImageElement,
  createShapeElement,
  createTextElement,
} from "@/lib/slide-defaults";
import type { Slide } from "@/types/carousel";
import type {
  BackgroundElement,
  ImageElement,
  ShapeElement,
  Span,
  TextElement,
} from "@/types/slide-model";
import type { SlideEditorAction } from "./useSlideEditor";

interface PropertiesPanelProps {
  slide: Slide;
  selection: string | null;
  dispatch: (action: SlideEditorAction) => void;
  onClose?: () => void;
}

/**
 * Right-rail editor panel. Contextual: shows controls for the selected
 * element, or background controls + add-element menu when nothing is
 * selected.
 *
 * Edits dispatch through the same reducer as drag/resize, so they share
 * the debounced persist path.
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
    <aside className="w-[300px] shrink-0 border-l border-border bg-white flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">
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

      <div className="flex-1 px-4 py-4 space-y-4">
        {!selected && (
          <>
            <BackgroundControls
              background={slide.background}
              onChange={(bg) => dispatch({ type: "SET_BACKGROUND", background: bg })}
            />
            <Divider />
            <AddElementMenu dispatch={dispatch} />
          </>
        )}

        {selected?.kind === "text" && (
          <TextControls element={selected} dispatch={dispatch} />
        )}
        {selected?.kind === "image" && (
          <ImageControls element={selected} dispatch={dispatch} />
        )}
        {selected?.kind === "shape" && (
          <ShapeControls element={selected} dispatch={dispatch} />
        )}

        {selected && (
          <>
            <Divider />
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
                    i === 0 ? { ...s, color } : s,
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
                    i === background.stops.length - 1 ? { ...s, color } : s,
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
  const add = (kind: "text" | "image" | "shape") => {
    const element =
      kind === "text"
        ? createTextElement({ x: 100, y: 100, content: "New text" })
        : kind === "image"
          ? createImageElement({ src: "/uploads/placeholder.png", x: 100, y: 100 })
          : createShapeElement({ x: 100, y: 100 });
    dispatch({ type: "ADD_ELEMENT", element });
  };

  return (
    <Section title="Add element">
      <div className="grid grid-cols-3 gap-2">
        <ActionButton onClick={() => add("text")}>Text</ActionButton>
        <ActionButton onClick={() => add("image")}>Image</ActionButton>
        <ActionButton onClick={() => add("shape")}>Shape</ActionButton>
      </div>
    </Section>
  );
}

// ---------- text ----------

function TextControls({
  element,
  dispatch,
}: {
  element: TextElement;
  dispatch: (action: SlideEditorAction) => void;
}) {
  const span = element.spans[0];
  const updateFirstSpan = (patch: Partial<Span>) => {
    const spans = element.spans.map((s, i) => (i === 0 ? { ...s, ...patch } : s));
    dispatch({ type: "EDIT_SPANS", elementId: element.id, spans });
  };

  return (
    <>
      <Section title="Content">
        <textarea
          value={span.content}
          onChange={(e) => updateFirstSpan({ content: e.target.value })}
          rows={3}
          className="w-full text-sm border border-border rounded px-2 py-1.5 resize-y"
        />
      </Section>

      <Section title="Typography">
        <Field label="Font family">
          <TextInput
            value={span.fontFamily}
            onChange={(fontFamily) => updateFirstSpan({ fontFamily })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Size">
            <NumberInput
              value={span.fontSize}
              onChange={(fontSize) => updateFirstSpan({ fontSize })}
            />
          </Field>
          <Field label="Weight">
            <SelectInput
              value={String(span.fontWeight)}
              options={[
                { value: "300", label: "Light" },
                { value: "400", label: "Regular" },
                { value: "500", label: "Medium" },
                { value: "600", label: "Semibold" },
                { value: "700", label: "Bold" },
                { value: "800", label: "Extra Bold" },
                { value: "900", label: "Black" },
              ]}
              onChange={(v) =>
                updateFirstSpan({
                  fontWeight: Number(v) as TextElement["spans"][number]["fontWeight"],
                })
              }
            />
          </Field>
        </div>
        <Field label="Color">
          <ColorInput
            value={span.color}
            onChange={(color) => updateFirstSpan({ color })}
          />
        </Field>
      </Section>

      <Section title="Layout">
        <Field label="Alignment">
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((a) => (
              <Tab
                key={a}
                active={element.alignment === a}
                onClick={() =>
                  dispatch({
                    type: "PATCH_ELEMENT",
                    elementId: element.id,
                    patch: { alignment: a },
                  })
                }
              >
                {a}
              </Tab>
            ))}
          </div>
        </Field>
        <Field label="Line height">
          <NumberInput
            value={element.lineHeight}
            step={0.1}
            onChange={(lineHeight) =>
              dispatch({
                type: "PATCH_ELEMENT",
                elementId: element.id,
                patch: { lineHeight },
              })
            }
          />
        </Field>
      </Section>
    </>
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
    <Section title="Image">
      <Field label="Source">
        <TextInput
          value={element.src}
          onChange={(src) =>
            dispatch({
              type: "PATCH_ELEMENT",
              elementId: element.id,
              patch: { src },
            })
          }
        />
      </Field>
      <Field label="Fit">
        <SelectInput
          value={element.fit}
          options={[
            { value: "cover", label: "Cover" },
            { value: "contain", label: "Contain" },
          ]}
          onChange={(fit) =>
            dispatch({
              type: "PATCH_ELEMENT",
              elementId: element.id,
              patch: { fit: fit as "cover" | "contain" },
            })
          }
        />
      </Field>
      <Field label="Border radius (px)">
        <NumberInput
          value={element.borderRadius ?? 0}
          onChange={(borderRadius) =>
            dispatch({
              type: "PATCH_ELEMENT",
              elementId: element.id,
              patch: { borderRadius },
            })
          }
        />
      </Field>
    </Section>
  );
}

// ---------- shape ----------

function ShapeControls({
  element,
  dispatch,
}: {
  element: ShapeElement;
  dispatch: (action: SlideEditorAction) => void;
}) {
  const fillColor =
    element.fill.kind === "solid" ? element.fill.color : element.fill.stops[0].color;

  return (
    <Section title="Shape">
      <Field label="Type">
        <div className="flex gap-1">
          {(["rect", "circle"] as const).map((s) => (
            <Tab
              key={s}
              active={element.shape === s}
              onClick={() =>
                dispatch({
                  type: "PATCH_ELEMENT",
                  elementId: element.id,
                  patch: { shape: s },
                })
              }
            >
              {s}
            </Tab>
          ))}
        </div>
      </Field>
      <Field label="Fill color">
        <ColorInput
          value={fillColor}
          onChange={(color) =>
            dispatch({
              type: "PATCH_ELEMENT",
              elementId: element.id,
              patch: { fill: { kind: "solid", color } },
            })
          }
        />
      </Field>
      <Field label="Border radius (px)">
        <NumberInput
          value={element.borderRadius ?? 0}
          onChange={(borderRadius) =>
            dispatch({
              type: "PATCH_ELEMENT",
              elementId: element.id,
              patch: { borderRadius },
            })
          }
        />
      </Field>
    </Section>
  );
}

// ---------- common (position/size/delete) ----------

function CommonElementControls({
  element,
  dispatch,
}: {
  element: TextElement | ImageElement | ShapeElement;
  dispatch: (action: SlideEditorAction) => void;
}) {
  const sizeH =
    element.kind === "text" && element.size.h === "auto"
      ? "auto"
      : (element.size.h as number);

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
                patch: { size: { ...element.size, w } as ImageElement["size"] },
              })
            }
          />
        </Field>
        {sizeH !== "auto" && (
          <Field label="H">
            <NumberInput
              value={sizeH}
              onChange={(h) =>
                dispatch({
                  type: "PATCH_ELEMENT",
                  elementId: element.id,
                  patch: { size: { ...element.size, h } as ImageElement["size"] },
                })
              }
            />
          </Field>
        )}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="block text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

function Divider() {
  return <div className="h-px bg-border my-2" />;
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
