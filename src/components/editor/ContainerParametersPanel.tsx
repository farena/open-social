"use client";

import { useState } from "react";
import type { ParameterType } from "@/types/component";

interface Props {
  parameters: Record<string, string>;
  parameterTypes?: Record<string, ParameterType>;
  /**
   * Called with the full next parameter map whenever a field changes. The
   * editor dispatches this into the slide reducer (PATCH_ELEMENT) so the
   * preview re-interpolates immediately and the change rides the normal
   * debounced persist — never a separate server write, which would conflict
   * with the editor's whole-slide PUT.
   */
  onChange: (parameters: Record<string, string>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveType(
  key: string,
  parameterTypes?: Record<string, ParameterType>,
): ParameterType {
  return parameterTypes?.[key] ?? "text";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContainerParametersPanel({
  parameters,
  parameterTypes,
  onChange,
}: Props) {
  const keys = Object.keys(parameters);
  if (keys.length === 0) return null;

  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        Component parameters
      </h4>
      <div className="space-y-3">
        {keys.map((key) => (
          <ParameterField
            key={key}
            paramKey={key}
            value={parameters[key]}
            type={resolveType(key, parameterTypes)}
            allParameters={parameters}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single parameter field
// ---------------------------------------------------------------------------

interface FieldProps {
  paramKey: string;
  value: string;
  type: ParameterType;
  allParameters: Record<string, string>;
  onChange: (parameters: Record<string, string>) => void;
}

function ParameterField({
  paramKey,
  value,
  type,
  allParameters,
  onChange,
}: FieldProps) {
  const [localValue, setLocalValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange({ ...allParameters, [paramKey]: newValue });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          (data as { error?: string }).error ?? `Error ${res.status} uploading image.`;
        console.error("[ContainerParametersPanel] upload failed:", msg);
        setError(msg);
        return;
      }
      const data = await res.json();
      const url: string = (data as { url: string }).url;
      handleChange(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error while uploading.";
      console.error("[ContainerParametersPanel] upload exception:", err);
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <code className="text-[10px] font-mono bg-muted text-foreground px-1 py-0.5 rounded">
          {`{{${paramKey}}}`}
        </code>
        {error && (
          <span
            className="inline-block h-2 w-2 rounded-full bg-red-500 shrink-0"
            title={error}
          />
        )}
      </div>
      {type === "color" ? (
        <ColorParamInput value={localValue} onChange={handleChange} />
      ) : type === "image-url" ? (
        <ImageUrlParamInput
          value={localValue}
          uploading={uploading}
          onChange={handleChange}
          onUpload={handleUpload}
        />
      ) : (
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full text-sm border border-border rounded px-2 py-1"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color input (picker + hex text)
// ---------------------------------------------------------------------------

function ColorParamInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const hexVal = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hexVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
      />
      <input
        type="text"
        value={value}
        placeholder="#000000"
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-sm border border-border rounded px-2 py-1 font-mono"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image-url input (text + upload button)
// ---------------------------------------------------------------------------

function ImageUrlParamInput({
  value,
  uploading,
  onChange,
  onUpload,
}: {
  value: string;
  uploading: boolean;
  onChange: (v: string) => void;
  onUpload: (file: File) => void;
}) {
  const triggerUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onUpload(file);
    };
    input.click();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        placeholder="/uploads/image.jpg"
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-sm border border-border rounded px-2 py-1"
      />
      <button
        type="button"
        onClick={triggerUpload}
        disabled={uploading}
        className="shrink-0 text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-50"
      >
        {uploading ? "…" : "Upload"}
      </button>
    </div>
  );
}
