"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { IdeationChat } from "@/components/dashboard/IdeationChat";
import { ContentItemsTable } from "@/components/dashboard/ContentItemsTable";
import type { ContentItem } from "@/types/content-item";

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [claudeAvailable, setClaudeAvailable] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/content", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.contentItems ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Brand-empty redirect (first-run onboarding)
    fetch("/api/brand")
      .then((r) => r.json())
      .then((brandData: { name?: string }) => {
        if (!brandData?.name || brandData.name.trim() === "") {
          router.replace("/business-context");
          return;
        }
        fetchItems();
      })
      .catch(() => fetchItems());

    fetch("/api/chat/check")
      .then((r) => r.json())
      .then((data: { available?: boolean }) => {
        if (data.available === false) setClaudeAvailable(false);
      })
      .catch(() => {});
  }, [router, fetchItems]);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    },
    []
  );

  const handleCreateBlank = useCallback(async () => {
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "post", hook: "New idea" }),
    });
    if (res.ok) {
      const created: ContentItem = await res.json();
      router.push(`/content/${created.id}`);
    }
  }, [router]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left rail — Ideation chat (~360px) */}
        <div className="w-[360px] shrink-0 border-r border-border flex flex-col bg-surface min-h-0">
          <IdeationChat
            claudeAvailable={claudeAvailable}
            onItemsCreated={fetchItems}
          />
        </div>

        {/* Right — Content items table */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <ContentItemsTable
              items={items}
              onDelete={handleDelete}
              onCreateBlank={handleCreateBlank}
            />
          )}
        </div>
      </div>
    </div>
  );
}
