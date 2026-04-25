"use client";

import { useEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import type { Span, TextElement } from "@/types/slide-model";

interface LexicalTextEditorProps {
  element: TextElement;
  scale: number;
  onCommit: (spans: Span[]) => void;
  onCancel: () => void;
}

/**
 * Inline rich-text editor that mounts above a selected TextElement.
 *
 * V1 scope: plain-text editing of the *first span's content* while
 * preserving its style. The intent is that quick text edits happen here
 * while structural styling (size, weight, color, alignment) happens in
 * PropertiesPanel. Rich per-span styling inline is a follow-up.
 *
 * Lexical's modules are loaded statically at the module top — Next code-
 * splits this file at the chunk boundary, so the editor only ships when
 * the user navigates to the carousel page (not the home page).
 */
export function LexicalTextEditor({
  element,
  scale,
  onCommit,
  onCancel,
}: LexicalTextEditorProps) {
  const initialContent = element.spans.map((s) => s.content).join("");
  const firstSpan = element.spans[0];
  const sizeH =
    element.size.h === "auto" ? "auto" : `${element.size.h * scale}px`;

  const initialConfig = {
    namespace: "SlideTextEditor",
    onError: (error: Error) => {
      console.error("Lexical error:", error);
    },
    editorState: () => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      // Split on newlines so each line becomes its own paragraph
      const lines = initialContent.split("\n");
      lines.forEach((line, idx) => {
        if (idx === 0) {
          paragraph.append($createTextNode(line));
          root.append(paragraph);
        } else {
          const p = $createParagraphNode();
          p.append($createTextNode(line));
          root.append(p);
        }
      });
      if (lines.length === 0) root.append(paragraph);
    },
  };

  const handleChange = (editorState: EditorState) => {
    // No-op during typing — we commit on blur/Esc to avoid spamming the
    // reducer mid-keystroke. Kept here for future rich-text support.
    void editorState;
  };

  const commit = (editor: LexicalEditor) => {
    let next = "";
    editor.getEditorState().read(() => {
      const root = $getRoot();
      // Join paragraphs with \n
      const paragraphs = root.getChildren();
      next = paragraphs.map((p) => p.getTextContent()).join("\n");
    });
    if (next === initialContent) {
      onCancel();
      return;
    }
    const updatedSpans: Span[] = [
      { ...firstSpan, content: next },
      ...element.spans.slice(1),
    ];
    onCommit(updatedSpans);
  };

  return (
    <div
      style={{
        position: "absolute",
        left: element.position.x * scale,
        top: element.position.y * scale,
        width: element.size.w * scale,
        height: sizeH,
        background: "rgba(255, 255, 255, 0.96)",
        border: "2px solid #3b82f6",
        borderRadius: 4,
        padding: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 10,
        pointerEvents: "auto",
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              autoFocus
              style={{
                outline: "none",
                fontFamily: firstSpan.fontFamily,
                fontSize: firstSpan.fontSize * scale,
                fontWeight: firstSpan.fontWeight,
                color: firstSpan.color,
                lineHeight: element.lineHeight,
                textAlign: element.alignment,
                minHeight: 24,
                whiteSpace: "pre-wrap",
              }}
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <OnChangePlugin onChange={handleChange} />
        <HistoryPlugin />
        <CommitOnBlurOrEscape onCommit={commit} onCancel={onCancel} />
      </LexicalComposer>
    </div>
  );
}

/**
 * Listens for blur and Escape keypresses inside the editor to commit or
 * cancel. Lives inside the Composer so it has access to the editor instance.
 */
function CommitOnBlurOrEscape({
  onCommit,
  onCancel,
}: {
  onCommit: (editor: LexicalEditor) => void;
  onCancel: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const committedRef = useRef(false);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const onBlur = () => {
      if (committedRef.current) return;
      committedRef.current = true;
      onCommit(editor);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        committedRef.current = true;
        onCancel();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        committedRef.current = true;
        onCommit(editor);
      }
    };

    root.addEventListener("blur", onBlur);
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("blur", onBlur);
      root.removeEventListener("keydown", onKey);
    };
  }, [editor, onCommit, onCancel]);

  return null;
}
