"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Save, Plus, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BusinessContext } from "@/types/business-context";
import { DEFAULT_BUSINESS_CONTEXT } from "@/types/business-context";

interface BusinessContextViewProps {
  context: BusinessContext;
  onSaved: (updated: BusinessContext) => void;
  onReload: () => void;
}

export function BusinessContextView({
  context,
  onSaved,
  onReload,
}: BusinessContextViewProps) {
  const [draft, setDraft] = useState<BusinessContext>(context);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [newKeyMessage, setNewKeyMessage] = useState("");
  const [newDifferentiator, setNewDifferentiator] = useState("");

  useEffect(() => {
    setDraft(context);
  }, [context]);

  const isDirty =
    draft.summary !== context.summary ||
    draft.audience !== context.audience ||
    draft.products !== context.products ||
    draft.tone !== context.tone ||
    draft.competitors !== context.competitors ||
    draft.notes !== context.notes ||
    draft.keyMessages.join("|") !== context.keyMessages.join("|") ||
    draft.differentiators.join("|") !== context.differentiators.join("|");

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/business-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: draft.summary,
          audience: draft.audience,
          products: draft.products,
          tone: draft.tone,
          keyMessages: draft.keyMessages,
          differentiators: draft.differentiators,
          competitors: draft.competitors,
          notes: draft.notes,
        }),
      });
      if (res.ok) {
        const updated: BusinessContext = await res.json();
        onSaved(updated);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved]);

  const addKeyMessage = () => {
    const v = newKeyMessage.trim();
    if (!v) return;
    setDraft({ ...draft, keyMessages: [...draft.keyMessages, v] });
    setNewKeyMessage("");
  };

  const addDifferentiator = () => {
    const v = newDifferentiator.trim();
    if (!v) return;
    setDraft({ ...draft, differentiators: [...draft.differentiators, v] });
    setNewDifferentiator("");
  };

  const removeKeyMessage = (i: number) => {
    setDraft({
      ...draft,
      keyMessages: draft.keyMessages.filter((_, idx) => idx !== i),
    });
  };

  const removeDifferentiator = (i: number) => {
    setDraft({
      ...draft,
      differentiators: draft.differentiators.filter((_, idx) => idx !== i),
    });
  };

  const isEmpty =
    draft === DEFAULT_BUSINESS_CONTEXT ||
    (!draft.summary &&
      !draft.audience &&
      !draft.products &&
      !draft.tone &&
      draft.keyMessages.length === 0 &&
      draft.differentiators.length === 0 &&
      !draft.competitors &&
      !draft.notes);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold">Business Context</h1>
          <p className="text-xs text-muted-foreground">
            This memory is injected into every carousel chat
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReload}
            aria-label="Reload"
            title="Reload from disk"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving}
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
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {isEmpty && (
            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <p className="text-sm font-medium mb-1">
                No business context yet
              </p>
              <p className="text-xs text-muted-foreground">
                Use the Context Coach on the left or fill the fields below.
              </p>
            </div>
          )}

          <Field label="Summary" hint="One-sentence elevator pitch.">
            <textarea
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              placeholder="We help X do Y by Z."
              rows={2}
              className={textareaClass}
            />
          </Field>

          <Field
            label="Audience"
            hint="Who you sell to — role, industry, pain point."
          >
            <textarea
              value={draft.audience}
              onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
              placeholder="Founders of language schools in Spain and Ireland..."
              rows={3}
              className={textareaClass}
            />
          </Field>

          <Field label="Products / services">
            <textarea
              value={draft.products}
              onChange={(e) => setDraft({ ...draft, products: e.target.value })}
              placeholder="Kmpus is a SaaS that..."
              rows={3}
              className={textareaClass}
            />
          </Field>

          <Field
            label="Tone of voice"
            hint="e.g. expert and warm, edgy and direct, playful."
          >
            <Input
              value={draft.tone}
              onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
              placeholder="Expert, direct, no fluff."
            />
          </Field>

          <Field
            label="Key messages"
            hint="Recurring talking points that should show up across carousels."
          >
            <div className="space-y-2">
              {draft.keyMessages.map((msg, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
                >
                  <span className="flex-1">{msg}</span>
                  <button
                    onClick={() => removeKeyMessage(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newKeyMessage}
                  onChange={(e) => setNewKeyMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyMessage();
                    }
                  }}
                  placeholder="Add a key message and press Enter"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addKeyMessage}
                  disabled={!newKeyMessage.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Field>

          <Field label="Differentiators" hint="Why you, not the alternative.">
            <div className="space-y-2">
              {draft.differentiators.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
                >
                  <span className="flex-1">{d}</span>
                  <button
                    onClick={() => removeDifferentiator(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newDifferentiator}
                  onChange={(e) => setNewDifferentiator(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDifferentiator();
                    }
                  }}
                  placeholder="Add a differentiator and press Enter"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addDifferentiator}
                  disabled={!newDifferentiator.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Field>

          <Field
            label="Competitors / alternatives"
            hint="Who or what people use today instead of you."
          >
            <textarea
              value={draft.competitors}
              onChange={(e) =>
                setDraft({ ...draft, competitors: e.target.value })
              }
              placeholder="Esemtia, Aladdin, Classe365, manual spreadsheets..."
              rows={2}
              className={textareaClass}
            />
          </Field>

          <Field
            label="Extra notes"
            hint="Jargon, recurring objections, things to avoid saying."
          >
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Avoid the phrase &quot;all-in-one&quot; — competitors abuse it..."
              rows={4}
              className={textareaClass}
            />
          </Field>

          {context.updatedAt && (
            <p className="text-[11px] text-muted-foreground text-right">
              Last saved: {new Date(context.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

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
