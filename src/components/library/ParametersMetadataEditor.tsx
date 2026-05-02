"use client";

import { cn } from "@/lib/utils";
import type { ComponentParameter, ParameterType } from "@/types/component";

interface ParametersMetadataEditorProps {
  parameters: ComponentParameter[];
  onChange: (next: ComponentParameter[]) => void;
}

const TYPE_LABELS: Record<ParameterType, string> = {
  text: "Text",
  color: "Color",
  "image-url": "Image URL",
};

function updateParam(
  params: ComponentParameter[],
  key: string,
  patch: Partial<ComponentParameter>,
): ComponentParameter[] {
  return params.map((p) => (p.key === key ? { ...p, ...patch } : p));
}

export function ParametersMetadataEditor({
  parameters,
  onChange,
}: ParametersMetadataEditorProps) {
  if (parameters.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic leading-relaxed">
        No parameters yet. Use{" "}
        <code className="font-mono bg-muted px-1 rounded">{"{{name}}"}</code>{" "}
        in HTML or SCSS to add one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {parameters.map((param) => (
        <ParamRow
          key={param.key}
          param={param}
          onChange={(patch) => onChange(updateParam(parameters, param.key, patch))}
        />
      ))}
    </div>
  );
}

interface ParamRowProps {
  param: ComponentParameter;
  onChange: (patch: Partial<ComponentParameter>) => void;
}

function ParamRow({ param, onChange }: ParamRowProps) {
  return (
    <div className="border border-border rounded-lg p-3 flex flex-col gap-2 bg-surface">
      {/* Key badge + type selector */}
      <div className="flex items-center gap-2">
        <code className="text-xs font-mono bg-muted text-foreground px-1.5 py-0.5 rounded shrink-0">
          {`{{${param.key}}}`}
        </code>
        <select
          value={param.type}
          onChange={(e) => onChange({ type: e.target.value as ParameterType })}
          className="flex-1 text-xs border border-border rounded px-2 py-1 bg-white"
        >
          {(["text", "color", "image-url"] as ParameterType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Default value — type-dependent */}
      <DefaultValueInput param={param} onChange={onChange} />
    </div>
  );
}

function DefaultValueInput({ param, onChange }: ParamRowProps) {
  const val = param.defaultValue ?? "";

  if (param.type === "color") {
    const hexVal = /^#[0-9a-fA-F]{6}$/.test(val) ? val : "#000000";
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground shrink-0">
          Default:
        </span>
        <input
          type="color"
          value={hexVal}
          onChange={(e) => onChange({ defaultValue: e.target.value })}
          className={cn(
            "w-7 h-7 rounded border border-border cursor-pointer shrink-0",
          )}
        />
        <input
          type="text"
          value={val}
          placeholder="#000000"
          onChange={(e) => onChange({ defaultValue: e.target.value })}
          className="flex-1 text-xs border border-border rounded px-2 py-1 font-mono"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground shrink-0">
        Default:
      </span>
      <input
        type="text"
        value={val}
        placeholder={
          param.type === "image-url" ? "/uploads/image.jpg" : "Default value"
        }
        onChange={(e) => onChange({ defaultValue: e.target.value })}
        className="flex-1 text-xs border border-border rounded px-2 py-1"
      />
    </div>
  );
}
