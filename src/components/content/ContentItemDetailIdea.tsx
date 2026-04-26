"use client";

import { useState } from "react";
import { Save, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContentIdeaChat } from "@/components/content/ContentIdeaChat";
import type { ContentItem, ContentItemType } from "@/types/content-item";
import { cn } from "@/lib/utils";

interface Props {
  contentItem: ContentItem;
  onSaved: (updated: ContentItem) => void;
  onGenerateRequested: () => void;
  claudeAvailable?: boolean;
  onItemUpdated?: () => void;
}

const TYPE_OPTIONS: { value: ContentItemType; label: string }[] = [
  { value: "post", label: "Post" },
  { value: "story", label: "Story" },
  { value: "carousel", label: "Carousel" },
];

const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y";

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

export function ContentItemDetailIdea({
  contentItem,
  onSaved,
  onGenerateRequested,
  claudeAvailable = true,
  onItemUpdated,
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

  const canGenerate = hook.trim() !== "" && bodyIdea.trim() !== "" && type !== undefined;

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
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex min-h-0 overflow-hidden">
      {/* Left rail — chat */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col bg-surface">
        <ContentIdeaChat
          contentItemId={contentItem.id}
          claudeAvailable={claudeAvailable}
          onItemUpdated={onItemUpdated}
        />
      </div>

      {/* Right panel — form */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Inner top bar */}
        <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold">Edit idea</h2>
            <p className="text-xs text-muted-foreground">
              Fill in the details before generating content.
            </p>
          </div>
          <Button
            variant="accent"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {savedFlash ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </>
            )}
          </Button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-[600px] mx-auto space-y-6">
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
          <Field label="Body idea" hint="What's the main content / message? (required)">
            <textarea
              value={bodyIdea}
              onChange={(e) => setBodyIdea(e.target.value)}
              placeholder="Walk through the 3 steps to… / Explain why… / Compare…"
              rows={4}
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
              rows={3}
              className={textareaClass}
            />
          </Field>
          </div>
        </div>

        {/* Sticky footer — Generate button */}
        <div className="shrink-0 border-t border-border bg-surface px-6 py-4">
          <div className="max-w-[600px] mx-auto">
            <Button
              variant="accent"
              size="lg"
              className="w-full"
              disabled={!canGenerate}
              onClick={onGenerateRequested}
            >
              Generate Content
            </Button>
            {!canGenerate && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Fill in Hook and Body idea to unlock generation.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
