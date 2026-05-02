"use client";

import { Wand2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { Plugin } from "prettier";
import { useState } from "react";
import { cn } from "@/lib/utils";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-white text-[10px] text-muted-foreground flex items-center justify-center">
      Loading editor…
    </div>
  ),
});

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: "html" | "css" | "scss" | "javascript" | "typescript" | "json";
  height?: number | string;
  className?: string;
}

const PRETTIER_PARSER: Record<CodeEditorProps["language"], string | null> = {
  html: "html",
  css: "css",
  scss: "scss",
  javascript: "babel",
  typescript: "typescript",
  json: "json",
};

async function formatWithPrettier(
  source: string,
  language: CodeEditorProps["language"],
): Promise<string> {
  const parser = PRETTIER_PARSER[language];
  if (!parser) return source;

  const prettier = await import("prettier/standalone");
  const plugins: Plugin[] = [];

  if (parser === "html") {
    plugins.push((await import("prettier/plugins/html")).default);
  } else if (parser === "css" || parser === "scss") {
    plugins.push((await import("prettier/plugins/postcss")).default);
  } else if (parser === "babel" || parser === "typescript") {
    plugins.push((await import("prettier/plugins/babel")).default);
    plugins.push((await import("prettier/plugins/typescript")).default);
    plugins.push((await import("prettier/plugins/estree")).default);
  } else if (parser === "json") {
    plugins.push((await import("prettier/plugins/babel")).default);
    plugins.push((await import("prettier/plugins/estree")).default);
  }

  // CSS/SCSS in this project is "scoped fragment" syntax — top-level
  // declarations + nested `&` rules — because the serializer wraps it in a
  // `[data-element-id="..."] { ... }` block. Prettier rejects orphan
  // declarations, so we wrap before formatting and unwrap after.
  const isScopedFragment = parser === "css" || parser === "scss";
  const input = isScopedFragment ? `.__wrap__ {\n${source}\n}` : source;

  const formatted = await prettier.format(input, {
    parser,
    plugins,
    tabWidth: 2,
    printWidth: 80,
    semi: true,
    singleQuote: false,
  });

  if (!isScopedFragment) return formatted;
  return unwrapScopedFragment(formatted);
}

function unwrapScopedFragment(formatted: string): string {
  const start = formatted.indexOf("{");
  const end = formatted.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return formatted;
  const inner = formatted.slice(start + 1, end);
  // Dedent one indent level (2 spaces) since we wrapped with one selector.
  const dedented = inner
    .split("\n")
    .map((line) => (line.startsWith("  ") ? line.slice(2) : line))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
  return `${dedented}\n`;
}

export function CodeEditor({
  value,
  onChange,
  language,
  height = 200,
  className,
}: CodeEditorProps) {
  const [formatting, setFormatting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFormat() {
    setFormatting(true);
    setError(null);
    try {
      const formatted = await formatWithPrettier(value, language);
      if (formatted !== value) onChange(formatted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Format failed");
    } finally {
      setFormatting(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className="relative border border-border rounded overflow-hidden bg-white"
        style={{ height }}
      >
        <MonacoEditor
          value={value}
          language={language}
          theme="vs"
          onChange={(next) => onChange(next ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            folding: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            renderLineHighlight: "line",
            padding: { top: 6, bottom: 6 },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            formatOnPaste: true,
            formatOnType: true,
            autoIndent: "advanced",
            bracketPairColorization: { enabled: true },
          }}
        />
        <button
          type="button"
          onClick={handleFormat}
          disabled={formatting}
          title="Format with Prettier"
          className="absolute top-1.5 right-3 z-10 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border bg-white/90 hover:bg-white hover:border-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
        >
          <Wand2 className="w-3 h-3" />
          {formatting ? "…" : "Format"}
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-red-600 leading-tight">{error}</p>
      )}
    </div>
  );
}
