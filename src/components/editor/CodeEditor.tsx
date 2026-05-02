"use client";

import dynamic from "next/dynamic";
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

export function CodeEditor({
  value,
  onChange,
  language,
  height = 200,
  className,
}: CodeEditorProps) {
  return (
    <div
      className={cn(
        "border border-border rounded overflow-hidden bg-white",
        className,
      )}
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
    </div>
  );
}
