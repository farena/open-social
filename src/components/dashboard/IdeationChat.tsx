"use client";

import { useRef, useEffect } from "react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { AlertCircle, Plug } from "lucide-react";
import { useChatStream } from "@/lib/use-chat-stream";

interface IdeationChatProps {
  claudeAvailable: boolean;
  onItemsCreated?: () => void;
}

const STORAGE_KEY = "chat-messages-ideation";
const SESSION_KEY = "chat-session-ideation";

export function IdeationChat({
  claudeAvailable,
  onItemsCreated,
}: IdeationChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming, error, send, clear, stop } = useChatStream({
    storageKey: STORAGE_KEY,
    sessionKey: SESSION_KEY,
    onStreamEnd: onItemsCreated,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (message: string) => {
    await send(message, { mode: "ideation" });
  };

  if (!claudeAvailable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Plug className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-sm mb-1">Connect Claude CLI</h3>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          Install Claude CLI to use the ideation agent.{" "}
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
          <h2 className="text-sm font-semibold">Ideation Agent</h2>
          <p className="text-xs text-muted-foreground">
            Ask for ideas — they&apos;ll appear in the table on the right
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            <p className="text-sm mb-1">No messages yet</p>
            <p className="text-xs">
              Try: &ldquo;Give me 5 carousel ideas about teachers&rdquo;
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
        onStop={stop}
      />
    </div>
  );
}
