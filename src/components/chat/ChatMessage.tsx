"use client";

import { cn } from "@/lib/utils";
import { Bot, User, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { MessagePart } from "@/types/chat";

interface ChatMessageProps {
  role: "user" | "assistant";
  parts: MessagePart[];
  isStreaming?: boolean;
}

export function ChatMessage({ role, parts, isStreaming }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "oc-enter flex gap-3 px-4 py-3",
        role === "user" ? "bg-transparent" : "bg-muted/50"
      )}
    >
      <div
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          role === "user"
            ? "bg-foreground text-background"
            : "bg-accent text-accent-foreground"
        )}
      >
        {role === "user" ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground mb-1">
          {role === "user" ? "You" : "Carrusel AI"}
        </div>
        <div className="text-sm leading-relaxed break-words">
          {parts.map((part, i) => {
            if (part.kind === "text") {
              return (
                <span key={i} className="whitespace-pre-wrap">
                  {part.text}
                </span>
              );
            }
            // tool part
            return (
              <div key={i} className="my-1.5">
                <div className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 border border-border/60 px-2 py-1 text-[11px] font-mono text-muted-foreground">
                  {part.status === "running" && (
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  )}
                  {part.status === "ok" && (
                    <CheckCircle2 className="h-3 w-3 text-accent shrink-0" />
                  )}
                  {part.status === "error" && (
                    <XCircle className="h-3 w-3 text-destructive shrink-0" />
                  )}
                  <span className="font-semibold">{part.name}</span>
                  <span
                    className="truncate max-w-[280px]"
                    title={part.summary}
                  >
                    {part.summary}
                  </span>
                </div>
                {part.status === "error" && part.resultSummary && (
                  <div className="mt-0.5 text-[10px] text-destructive font-mono pl-1">
                    {part.resultSummary}
                  </div>
                )}
              </div>
            );
          })}
          {isStreaming && (
            <span className="oc-caret inline-block w-1.5 h-4 bg-accent ml-0.5 align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
}
