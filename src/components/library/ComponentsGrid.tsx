"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Copy, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Component } from "@/types/component";

interface ComponentsGridProps {
  components: Component[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function ComponentsGrid({ components }: ComponentsGridProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [optimisticComponents, setOptimisticComponents] =
    useState<Component[]>(components);
  const [pendingDelete, setPendingDelete] = useState<Component | null>(null);

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const c of optimisticComponents) {
      for (const tag of c.tags) {
        if (!seen.has(tag)) {
          seen.add(tag);
          tags.push(tag);
        }
      }
    }
    return tags;
  }, [optimisticComponents]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return optimisticComponents.filter((c) => {
      if (q) {
        const haystack = [c.name, c.description ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (activeTags.length > 0) {
        for (const t of activeTags) {
          if (!c.tags.includes(t)) return false;
        }
      }
      return true;
    });
  }, [optimisticComponents, query, activeTags]);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/components/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setOptimisticComponents((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const handleDuplicate = async (component: Component) => {
    const body = {
      name: `${component.name} (copy)`,
      description: component.description,
      htmlContent: component.htmlContent,
      scssStyles: component.scssStyles,
      parametersSchema: component.parametersSchema,
      width: component.width,
      height: component.height,
      tags: component.tags,
    };
    const res = await fetch("/api/components", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3">
        <Input
          type="search"
          placeholder="Search components…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        {optimisticComponents.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {filtered.length} of {optimisticComponents.length}
          </span>
        )}
        <Button asChild size="sm" className="ml-auto gap-1.5">
          <Link href="/components/new">
            <Plus className="h-3.5 w-3.5" />
            New
          </Link>
        </Button>
      </div>

      {/* ── Tag filter chips ── */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer",
                activeTags.includes(tag)
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-surface text-muted-foreground border-border hover:border-accent/50 hover:text-foreground",
              )}
            >
              {tag}
            </button>
          ))}
          {activeTags.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTags([])}
              className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Confirm delete ── */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name ?? ""}"?`}
        description="This will permanently delete the component. Inserted copies in slides are unaffected."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          {optimisticComponents.length === 0 ? (
            <>
              <p className="text-sm font-medium text-foreground">
                No components yet.
              </p>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Save a container from the slide editor as a component to see it
                here.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No matching components.
            </p>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium whitespace-nowrap">
                  Created at
                </th>
                <th className="text-right px-4 py-2 font-medium whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((component) => (
                <tr
                  key={component.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors group"
                >
                  {/* Name (with tags) */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/components/${component.id}`}
                      className="block hover:text-accent transition-colors"
                    >
                      <span className="font-medium">{component.name}</span>
                      {component.description && (
                        <span className="block text-xs text-muted-foreground truncate max-w-[400px]">
                          {component.description}
                        </span>
                      )}
                      {component.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {component.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Link>
                  </td>

                  {/* Created at */}
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                    <span title={component.createdAt}>
                      {formatDate(component.createdAt)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/components/${component.id}`}
                        className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Edit"
                        aria-label={`Edit ${component.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(component)}
                        className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Duplicate"
                        aria-label={`Duplicate ${component.name}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(component)}
                        className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Delete"
                        aria-label={`Delete ${component.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
