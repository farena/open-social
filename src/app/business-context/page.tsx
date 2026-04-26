"use client";

import { useEffect, useState, useCallback } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { BusinessContextChat } from "@/components/business-context/BusinessContextChat";
import { BusinessContextView } from "@/components/business-context/BusinessContextView";
import type { BusinessContext } from "@/types/business-context";
import { DEFAULT_BUSINESS_CONTEXT } from "@/types/business-context";
import type { BrandConfig } from "@/types/brand";
import { DEFAULT_BRAND } from "@/types/brand";

export default function BusinessContextPage() {
  const [context, setContext] = useState<BusinessContext>(DEFAULT_BUSINESS_CONTEXT);
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);
  const [claudeAvailable, setClaudeAvailable] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [ctxRes, brandRes] = await Promise.all([
        fetch("/api/business-context", { cache: "no-store" }),
        fetch("/api/brand", { cache: "no-store" }),
      ]);
      if (ctxRes.ok) {
        const data: BusinessContext = await ctxRes.json();
        setContext(data);
      }
      if (brandRes.ok) {
        const data: BrandConfig = await brandRes.json();
        setBrand(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetch("/api/chat/check")
      .then((r) => r.json())
      .then((data: { available?: boolean }) => {
        if (data.available === false) setClaudeAvailable(false);
      })
      .catch(() => {});
  }, [fetchAll]);

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Business Context" showBack />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-96 border-r border-border shrink-0 flex flex-col bg-surface">
          <BusinessContextChat
            claudeAvailable={claudeAvailable}
            onContextUpdated={fetchAll}
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
              brand={brand}
              onContextSaved={setContext}
              onBrandSaved={setBrand}
              onReload={fetchAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}
