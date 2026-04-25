"use client";

import { useEffect, useState, useCallback } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { BusinessContextChat } from "@/components/business-context/BusinessContextChat";
import { BusinessContextView } from "@/components/business-context/BusinessContextView";
import type { BusinessContext } from "@/types/business-context";
import { DEFAULT_BUSINESS_CONTEXT } from "@/types/business-context";

export default function BusinessContextPage() {
  const [context, setContext] = useState<BusinessContext>(DEFAULT_BUSINESS_CONTEXT);
  const [loading, setLoading] = useState(true);
  const [claudeAvailable, setClaudeAvailable] = useState(true);

  const fetchContext = useCallback(async () => {
    try {
      const res = await fetch("/api/business-context", { cache: "no-store" });
      if (res.ok) {
        const data: BusinessContext = await res.json();
        setContext(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
    fetch("/api/chat/check")
      .then((r) => r.json())
      .then((data: { available?: boolean }) => {
        if (data.available === false) setClaudeAvailable(false);
      })
      .catch(() => {});
  }, [fetchContext]);

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Business Context" showBack />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-96 border-r border-border shrink-0 flex flex-col bg-surface">
          <BusinessContextChat
            claudeAvailable={claudeAvailable}
            onContextUpdated={fetchContext}
          />
        </div>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <BusinessContextView
              context={context}
              onSaved={setContext}
              onReload={fetchContext}
            />
          )}
        </div>
      </div>
    </div>
  );
}
