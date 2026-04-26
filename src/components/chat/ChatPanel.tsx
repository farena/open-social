"use client";

import { useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ReferenceImages } from "./ReferenceImages";
import { Assets } from "./Assets";
import { AlertCircle, Plug } from "lucide-react";
import type { ReferenceImage } from "@/types/carousel";
import { useChatStream } from "@/lib/use-chat-stream";

interface ChatPanelProps {
  contentItemId: string;
  referenceImages?: ReferenceImage[];
  claudeAvailable: boolean;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatPanel({
  contentItemId,
  claudeAvailable,
  referenceImages = [],
  onStreamStart,
  onStreamEnd,
  chatInputRef,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming, error, send, clear, stop } = useChatStream({
    storageKey: `chat-messages-${contentItemId}`,
    sessionKey: `chat-session-${contentItemId}`,
    onStreamEnd,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (message: string) => {
    if (isStreaming) return;
    onStreamStart?.();
    await send(message, { contentItemId, mode: "content-generation" });
  };

  if (!claudeAvailable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Plug className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-sm mb-1">Connect Claude CLI</h3>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          Install Claude CLI to enable AI-powered content creation.{" "}
          <a
            href="https://docs.anthropic.com/en/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Install guide
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">AI Assistant</h2>
          <p className="text-xs text-muted-foreground">
            Describe the content you want to create
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded"
          >
            Clear
          </button>
        )}
      </div>

      <ReferenceImages
        contentItemId={contentItemId}
        images={referenceImages}
        onImagesChange={() => onStreamEnd?.()}
      />

      <Assets scope="carousel" contentItemId={contentItemId} />

      <Assets scope="library" />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            <p className="text-sm mb-1">No messages yet</p>
            <p className="text-xs">
              Tell me what content you&apos;d like to create
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            parts={msg.parts}
            isStreaming={
              isStreaming &&
              msg.role === "assistant" &&
              msg.id === messages[messages.length - 1]?.id
            }
          />
        ))}
        {error && (
          <div className="mx-4 my-2 flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        textareaRef={chatInputRef}
        onStop={stop}
      />
    </div>
  );
}
