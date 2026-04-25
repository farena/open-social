"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { AlertCircle, Plug } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface BusinessContextChatProps {
  claudeAvailable: boolean;
  onContextUpdated?: () => void;
}

const STORAGE_KEY = "chat-messages-business-context";
const SESSION_KEY = "chat-session-business-context";

export function BusinessContextChat({
  claudeAvailable,
  onContextUpdated,
}: BusinessContextChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedSession = localStorage.getItem(SESSION_KEY);
    if (storedSession) setSessionId(storedSession);
    try {
      const storedMessages = localStorage.getItem(STORAGE_KEY);
      if (storedMessages) setMessages(JSON.parse(storedMessages));
    } catch {
      // ignore corrupted data
    }
  }, []);

  const persistMessages = useCallback((msgs: Message[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    } catch {
      // ignore quota errors
    }
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  const handleStopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (message: string) => {
      if (isStreaming) return;
      setError(null);
      setIsStreaming(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
      };
      setMessages((prev) => [...prev, userMsg]);

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            sessionId,
            mode: "business-context",
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error || "Failed to connect to AI"
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "token" && typeof data.text === "string") {
                  accumulated += data.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: accumulated } : m
                    )
                  );
                } else if (
                  data.type === "result" &&
                  typeof data.text === "string"
                ) {
                  accumulated = data.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: accumulated } : m
                    )
                  );
                }
                if (data.sessionId) {
                  setSessionId(data.sessionId);
                  localStorage.setItem(SESSION_KEY, data.sessionId);
                }
              } catch {
                // skip unparseable
              }
            }
          }
        }

        if (buffer.trim()) {
          for (const line of buffer.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.sessionId) {
                  setSessionId(data.sessionId);
                  localStorage.setItem(SESSION_KEY, data.sessionId);
                }
              } catch {
                // skip
              }
            }
          }
        }

        // Notify parent that the context may have changed (chat saves via curl)
        onContextUpdated?.();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantId || m.content.length > 0)
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        setMessages((prev) => {
          persistMessages(prev);
          return prev;
        });
      }
    },
    [isStreaming, sessionId, persistMessages, onContextUpdated]
  );

  if (!claudeAvailable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Plug className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-sm mb-1">Connect Claude CLI</h3>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          Install Claude CLI to chat with the business context coach.{" "}
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
          <h2 className="text-sm font-semibold">Context Coach</h2>
          <p className="text-xs text-muted-foreground">
            Tell me about your business — I&apos;ll save it as memory for every carousel
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
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
              Start with: &ldquo;My business is...&rdquo; or paste your website
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
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
        onStop={handleStopGenerating}
      />
    </div>
  );
}
