"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Trash2, Hash, Check, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { ContentItem, ContentItemType, ContentItemState } from "@/types/content-item";

// ─── helpers ────────────────────────────────────────────────────────────────

function trunc(str: string, max: number): string {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

const TYPE_LABELS: Record<ContentItemType, string> = {
  post: "Post",
  story: "Story",
  carousel: "Carousel",
};

const STATE_LABELS: Record<ContentItemState, string> = {
  idea: "Idea",
  generating: "Generating",
  generated: "Generated",
};

function typeBadgeClass(type: ContentItemType): string {
  return cn({
    "border-blue-500/40 bg-blue-500/10 text-blue-600": type === "post",
    "border-purple-500/40 bg-purple-500/10 text-purple-600": type === "story",
    "border-amber-500/40 bg-amber-500/10 text-amber-600": type === "carousel",
  });
}

function stateBadgeClass(state: ContentItemState): string {
  return cn({
    "border-muted-foreground/30 bg-muted text-muted-foreground": state === "idea",
    "border-accent/40 bg-accent/10 text-accent": state === "generating",
    "border-green-500/40 bg-green-500/10 text-green-600": state === "generated",
  });
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

type DownloadedFilter = "all" | "yes" | "no";
type SortDir = "desc" | "asc";

// ─── props ───────────────────────────────────────────────────────────────────

interface ContentItemsTableProps {
  items: ContentItem[];
  onDelete: (id: string) => void | Promise<void>;
  onCreateBlank: () => void | Promise<void>;
}

// ─── component ───────────────────────────────────────────────────────────────

export function ContentItemsTable({
  items,
  onDelete,
  onCreateBlank,
}: ContentItemsTableProps) {
  // filter state
  const [typeFilter, setTypeFilter] = useState<"all" | ContentItemType>("all");
  const [stateFilter, setStateFilter] = useState<"all" | ContentItemState>("all");
  const [downloadedFilter, setDownloadedFilter] =
    useState<DownloadedFilter>("all");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // confirm-delete state
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    hook: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const matched = items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (stateFilter !== "all" && item.state !== stateFilter) return false;
      if (downloadedFilter === "yes" && !item.downloaded) return false;
      if (downloadedFilter === "no" && item.downloaded) return false;
      return true;
    });

    return matched.slice().sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, typeFilter, stateFilter, downloadedFilter, sortDir]);

  const selectClass =
    "h-8 rounded-lg border border-border bg-surface px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer";

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface shrink-0 flex-wrap">
        <Button variant="accent" size="sm" onClick={onCreateBlank}>
          <Plus className="h-3.5 w-3.5" />
          New idea
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <select
            className={selectClass}
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as "all" | ContentItemType)
            }
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="post">Post</option>
            <option value="story">Story</option>
            <option value="carousel">Carousel</option>
          </select>

          <select
            className={selectClass}
            value={stateFilter}
            onChange={(e) =>
              setStateFilter(e.target.value as "all" | ContentItemState)
            }
            aria-label="Filter by state"
          >
            <option value="all">All states</option>
            <option value="idea">Idea</option>
            <option value="generating">Generating</option>
            <option value="generated">Generated</option>
          </select>

          <select
            className={selectClass}
            value={downloadedFilter}
            onChange={(e) =>
              setDownloadedFilter(e.target.value as DownloadedFilter)
            }
            aria-label="Filter by downloaded"
          >
            <option value="all">All downloads</option>
            <option value="yes">Downloaded</option>
            <option value="no">Not downloaded</option>
          </select>
        </div>
      </div>

      {/* ── Confirm delete dialog ── */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${trunc(pendingDelete?.hook ?? "", 40)}"?`}
        description="This will permanently delete the content item."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center px-6">
          <p className="text-sm text-muted-foreground max-w-sm">
            Ask the agent on the left to generate ideas, or click{" "}
            <button
              onClick={onCreateBlank}
              className="text-accent underline underline-offset-2 hover:no-underline"
            >
              + New idea
            </button>
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-2 font-medium">Hook</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">
                  Idea
                </th>
                <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">
                  Caption
                </th>
                <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">
                  Hashtags
                </th>
                <th className="text-left px-4 py-2 font-medium">State</th>
                <th className="text-left px-4 py-2 font-medium whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
                    }
                    className="inline-flex items-center gap-1 uppercase tracking-wide text-xs font-medium hover:text-foreground transition-colors cursor-pointer"
                    aria-label={`Sort by created ${sortDir === "asc" ? "ascending" : "descending"}`}
                  >
                    Created
                    {sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                  </button>
                </th>
                <th className="text-left px-4 py-2 font-medium whitespace-nowrap">
                  Downloaded
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border hover:bg-muted/40 transition-colors group"
                >
                  {/* Hook — entire row is clickable via the Link overlay */}
                  <td className="px-4 py-3 font-medium max-w-[180px]">
                    <Link
                      href={"/content/" + item.id}
                      className="block truncate hover:text-accent transition-colors"
                      title={item.hook || undefined}
                    >
                      {trunc(item.hook, 60)}
                    </Link>
                  </td>

                  {/* Type badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={"/content/" + item.id} className="block">
                      <Badge
                        variant="outline"
                        className={typeBadgeClass(item.type)}
                      >
                        {TYPE_LABELS[item.type]}
                      </Badge>
                    </Link>
                  </td>

                  {/* Body idea */}
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] hidden md:table-cell">
                    <Link
                      href={"/content/" + item.id}
                      className="block truncate"
                      title={item.bodyIdea || undefined}
                    >
                      {trunc(item.bodyIdea, 80)}
                    </Link>
                  </td>

                  {/* Caption */}
                  <td className="px-4 py-3 text-muted-foreground max-w-[180px] hidden lg:table-cell">
                    <Link
                      href={"/content/" + item.id}
                      className="block truncate"
                      title={item.caption || undefined}
                    >
                      {trunc(item.caption, 60)}
                    </Link>
                  </td>

                  {/* Hashtags */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <Link
                      href={"/content/" + item.id}
                      className="flex items-center gap-1.5"
                    >
                      {item.hashtags.length > 0 ? (
                        <>
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            <Hash className="h-2.5 w-2.5" />
                            {item.hashtags.length}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                            #{item.hashtags[0]}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </Link>
                  </td>

                  {/* State badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={"/content/" + item.id} className="block">
                      <Badge
                        variant="outline"
                        className={stateBadgeClass(item.state)}
                      >
                        {STATE_LABELS[item.state]}
                      </Badge>
                    </Link>
                  </td>

                  {/* Created at */}
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                    <Link
                      href={"/content/" + item.id}
                      className="block"
                      title={item.createdAt}
                    >
                      {formatDate(item.createdAt)}
                    </Link>
                  </td>

                  {/* Downloaded */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={"/content/" + item.id} className="block">
                      {item.downloaded ? (
                        <Check
                          className="h-4 w-4 text-green-600"
                          aria-label="Downloaded"
                        />
                      ) : (
                        <span
                          className="text-xs text-muted-foreground"
                          aria-label="Not downloaded"
                        >
                          —
                        </span>
                      )}
                    </Link>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPendingDelete({ id: item.id, hook: item.hook });
                      }}
                      className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      aria-label={`Delete ${item.hook}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
