export type MessagePart =
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      toolId: string;
      name: string;
      summary: string;
      status: "running" | "ok" | "error";
      resultSummary?: string;
    };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
}
