"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Save, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentItem, ContentItemType } from "@/types/content-item";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentItem: ContentItem;
  onSaved: (updated: ContentItem) => void;
}

const TYPE_OPTIONS: { value: ContentItemType; label: string }[] = [
  { value: "post", label: "Post" },
  { value: "story", label: "Story" },
  { value: "carousel", label: "Carousel" },
];

const textareaClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium block">{label}</label>
      {hint && <p className="text-xs text-muted-foreground mb-2">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

export function ContentItemDetailModal({
  open,
  onOpenChange,
  contentItem,
  onSaved,
}: Props) {
  const [hook, setHook] = useState(contentItem.hook);
  const [type, setType] = useState<ContentItemType>(contentItem.type);
  const [bodyIdea, setBodyIdea] = useState(contentItem.bodyIdea);
  const [caption, setCaption] = useState(contentItem.caption);
  const [hashtags, setHashtags] = useState<string[]>(contentItem.hashtags);
  const [notes, setNotes] = useState(contentItem.notes ?? "");
  const [newHashtag, setNewHashtag] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Reset local state when the modal opens with a (potentially) fresh item.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setHook(contentItem.hook);
      setType(contentItem.type);
      setBodyIdea(contentItem.bodyIdea);
      setCaption(contentItem.caption);
      setHashtags(contentItem.hashtags);
      setNotes(contentItem.notes ?? "");
      setNewHashtag("");
      setSaving(false);
      setSavedFlash(false);
    }
    onOpenChange(next);
  };

  const addHashtag = () => {
    const v = newHashtag.trim().replace(/^#/, "");
    if (!v || hashtags.includes(v)) return;
    setHashtags([...hashtags, v]);
    setNewHashtag("");
  };

  const removeHashtag = (i: number) => {
    setHashtags(hashtags.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/content/${contentItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hook, type, bodyIdea, caption, hashtags, notes }),
      });
      if (res.ok) {
        const updated: ContentItem = await res.json();
        onSaved(updated);
        setSavedFlash(true);
        setTimeout(() => {
          setSavedFlash(false);
          onOpenChange(false);
        }, 800);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-oc-overlay
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        />
        <Dialog.Content
          data-oc-dialog
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface border border-border shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div>
              <Dialog.Title className="text-base font-semibold">
                Content details
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                Edit the text fields for this content item.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              {/* Hook */}
              <Field label="Hook" hint="Opening line that grabs attention. (required)">
                <Input
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  placeholder="The one insight that changed how I think about..."
                />
              </Field>

              {/* Type */}
              <Field label="Type">
                <div className="flex items-center gap-1 mt-2">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={cn(
                        "oc-press px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                        type === opt.value
                          ? "bg-foreground text-background border-foreground"
                          : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground/50 hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Body idea */}
              <Field label="Body idea" hint="What's the main content / message?">
                <textarea
                  value={bodyIdea}
                  onChange={(e) => setBodyIdea(e.target.value)}
                  placeholder="Walk through the 3 steps to… / Explain why… / Compare…"
                  rows={3}
                  className={textareaClass}
                />
              </Field>

              {/* Caption */}
              <Field label="Caption">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Instagram caption that accompanies the post…"
                  rows={3}
                  className={textareaClass}
                />
              </Field>

              {/* Hashtags */}
              <Field label="Hashtags" hint="Add one at a time and press Enter.">
                <div className="space-y-2">
                  {hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {hashtags.map((tag, i) => (
                        <span
                          key={i}
                          className="flex items-center gap-1 text-xs bg-accent/10 text-accent rounded-full px-2.5 py-1"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => removeHashtag(i)}
                            className="hover:text-destructive transition-colors"
                            aria-label={`Remove #${tag}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={newHashtag}
                      onChange={(e) => setNewHashtag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addHashtag();
                        }
                      }}
                      placeholder="Add hashtag and press Enter"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={addHashtag}
                      disabled={!newHashtag.trim()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Field>

              {/* Notes */}
              <Field label="Notes" hint="Optional: tone, references, things to avoid.">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Keep it short. Reference the blog post at…"
                  rows={2}
                  className={textareaClass}
                />
              </Field>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border px-6 py-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant="accent"
              size="sm"
              onClick={handleSave}
              disabled={saving || savedFlash}
            >
              {savedFlash ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save"}
                </>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
