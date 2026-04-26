"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Save, Plus, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/brand/ColorPicker";
import { FontSelector } from "@/components/brand/FontSelector";
import { LogoUpload } from "@/components/brand/LogoUpload";
import type { BusinessContext } from "@/types/business-context";
import { DEFAULT_BUSINESS_CONTEXT } from "@/types/business-context";
import type { BrandConfig } from "@/types/brand";
import { DEFAULT_BRAND } from "@/types/brand";

interface BusinessContextViewProps {
  context: BusinessContext;
  brand: BrandConfig;
  onContextSaved: (updated: BusinessContext) => void;
  onBrandSaved: (updated: BrandConfig) => void;
  onReload: () => void;
}

const STYLE_OPTIONS = [
  "minimal",
  "bold",
  "playful",
  "corporate",
  "luxury",
  "vintage",
  "modern",
  "elegant",
  "creative",
  "professional",
];

export function BusinessContextView({
  context,
  brand,
  onContextSaved,
  onBrandSaved,
  onReload,
}: BusinessContextViewProps) {
  const [draftContext, setDraftContext] = useState<BusinessContext>(context);
  const [draftBrand, setDraftBrand] = useState<BrandConfig>(brand);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [newKeyMessage, setNewKeyMessage] = useState("");
  const [newDifferentiator, setNewDifferentiator] = useState("");

  useEffect(() => {
    setDraftContext(context);
  }, [context]);

  useEffect(() => {
    setDraftBrand(brand);
  }, [brand]);

  const isContextDirty =
    draftContext.summary !== context.summary ||
    draftContext.audience !== context.audience ||
    draftContext.products !== context.products ||
    draftContext.tone !== context.tone ||
    draftContext.competitors !== context.competitors ||
    draftContext.notes !== context.notes ||
    draftContext.keyMessages.join("|") !== context.keyMessages.join("|") ||
    draftContext.differentiators.join("|") !== context.differentiators.join("|");

  const isBrandDirty =
    draftBrand.name !== brand.name ||
    draftBrand.logoPath !== brand.logoPath ||
    draftBrand.colors.primary !== brand.colors.primary ||
    draftBrand.colors.secondary !== brand.colors.secondary ||
    draftBrand.colors.accent !== brand.colors.accent ||
    draftBrand.colors.background !== brand.colors.background ||
    draftBrand.colors.surface !== brand.colors.surface ||
    draftBrand.fonts.heading !== brand.fonts.heading ||
    draftBrand.fonts.body !== brand.fonts.body ||
    draftBrand.styleKeywords.join("|") !== brand.styleKeywords.join("|");

  const isDirty = isContextDirty || isBrandDirty;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const tasks: Promise<void>[] = [];

      if (isContextDirty) {
        tasks.push(
          fetch("/api/business-context", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: draftContext.summary,
              audience: draftContext.audience,
              products: draftContext.products,
              tone: draftContext.tone,
              keyMessages: draftContext.keyMessages,
              differentiators: draftContext.differentiators,
              competitors: draftContext.competitors,
              notes: draftContext.notes,
            }),
          }).then(async (res) => {
            if (res.ok) {
              const updated: BusinessContext = await res.json();
              onContextSaved(updated);
            }
          }),
        );
      }

      if (isBrandDirty) {
        tasks.push(
          fetch("/api/brand", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draftBrand),
          }).then(async (res) => {
            if (res.ok) {
              const updated: BrandConfig = await res.json();
              onBrandSaved(updated);
            }
          }),
        );
      }

      await Promise.all(tasks);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [
    draftContext,
    draftBrand,
    isContextDirty,
    isBrandDirty,
    onContextSaved,
    onBrandSaved,
  ]);

  const addKeyMessage = () => {
    const v = newKeyMessage.trim();
    if (!v) return;
    setDraftContext({ ...draftContext, keyMessages: [...draftContext.keyMessages, v] });
    setNewKeyMessage("");
  };

  const addDifferentiator = () => {
    const v = newDifferentiator.trim();
    if (!v) return;
    setDraftContext({
      ...draftContext,
      differentiators: [...draftContext.differentiators, v],
    });
    setNewDifferentiator("");
  };

  const removeKeyMessage = (i: number) => {
    setDraftContext({
      ...draftContext,
      keyMessages: draftContext.keyMessages.filter((_, idx) => idx !== i),
    });
  };

  const removeDifferentiator = (i: number) => {
    setDraftContext({
      ...draftContext,
      differentiators: draftContext.differentiators.filter((_, idx) => idx !== i),
    });
  };

  const toggleStyleKeyword = (kw: string) => {
    const has = draftBrand.styleKeywords.includes(kw);
    setDraftBrand({
      ...draftBrand,
      styleKeywords: has
        ? draftBrand.styleKeywords.filter((k) => k !== kw)
        : [...draftBrand.styleKeywords, kw],
    });
  };

  const isContextEmpty =
    draftContext === DEFAULT_BUSINESS_CONTEXT ||
    (!draftContext.summary &&
      !draftContext.audience &&
      !draftContext.products &&
      !draftContext.tone &&
      draftContext.keyMessages.length === 0 &&
      draftContext.differentiators.length === 0 &&
      !draftContext.competitors &&
      !draftContext.notes);

  const isBrandEmpty = !draftBrand.name || draftBrand.name === DEFAULT_BRAND.name;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold">Business Context</h1>
          <p className="text-xs text-muted-foreground">
            Brand identity + context. Injected into every carousel chat.
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
        <div className="max-w-2xl mx-auto space-y-10">
          {(isContextEmpty || isBrandEmpty) && (
            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <p className="text-sm font-medium mb-1">
                Set up your brand &amp; business context
              </p>
              <p className="text-xs text-muted-foreground">
                Use the Context Coach on the left or fill the fields below.
              </p>
            </div>
          )}

          {/* ---------- BRAND ---------- */}
          <section className="space-y-6">
            <SectionHeader
              title="Brand identity"
              description="Visual identity used across every carousel."
            />

            <Field label="Brand name">
              <Input
                value={draftBrand.name}
                onChange={(e) =>
                  setDraftBrand({ ...draftBrand, name: e.target.value })
                }
                placeholder="Kmpus"
              />
            </Field>

            <Field label="Colors">
              <div className="space-y-3">
                <ColorPicker
                  label="Primary"
                  value={draftBrand.colors.primary}
                  onChange={(v) =>
                    setDraftBrand({
                      ...draftBrand,
                      colors: { ...draftBrand.colors, primary: v },
                    })
                  }
                />
                <ColorPicker
                  label="Secondary"
                  value={draftBrand.colors.secondary}
                  onChange={(v) =>
                    setDraftBrand({
                      ...draftBrand,
                      colors: { ...draftBrand.colors, secondary: v },
                    })
                  }
                />
                <ColorPicker
                  label="Accent"
                  value={draftBrand.colors.accent}
                  onChange={(v) =>
                    setDraftBrand({
                      ...draftBrand,
                      colors: { ...draftBrand.colors, accent: v },
                    })
                  }
                />
                <ColorPicker
                  label="Background"
                  value={draftBrand.colors.background}
                  onChange={(v) =>
                    setDraftBrand({
                      ...draftBrand,
                      colors: { ...draftBrand.colors, background: v },
                    })
                  }
                />
                <ColorPicker
                  label="Surface"
                  value={draftBrand.colors.surface}
                  onChange={(v) =>
                    setDraftBrand({
                      ...draftBrand,
                      colors: { ...draftBrand.colors, surface: v },
                    })
                  }
                />
              </div>
            </Field>

            <Field label="Fonts">
              <div className="space-y-3">
                <FontSelector
                  label="Heading"
                  value={draftBrand.fonts.heading}
                  onChange={(v) =>
                    setDraftBrand({
                      ...draftBrand,
                      fonts: { ...draftBrand.fonts, heading: v },
                    })
                  }
                />
                <FontSelector
                  label="Body"
                  value={draftBrand.fonts.body}
                  onChange={(v) =>
                    setDraftBrand({
                      ...draftBrand,
                      fonts: { ...draftBrand.fonts, body: v },
                    })
                  }
                />
              </div>
            </Field>

            <Field label="Logo">
              <LogoUpload
                value={draftBrand.logoPath}
                onChange={(path) =>
                  setDraftBrand({ ...draftBrand, logoPath: path })
                }
              />
            </Field>

            <Field
              label="Style keywords"
              hint="Pick the words that describe your visual identity."
            >
              <div className="flex flex-wrap gap-2">
                {STYLE_OPTIONS.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => toggleStyleKeyword(kw)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      draftBrand.styleKeywords.includes(kw)
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-transparent text-foreground border-border hover:border-muted-foreground"
                    }`}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </Field>
          </section>

          {/* ---------- CONTEXT ---------- */}
          <section className="space-y-6">
            <SectionHeader
              title="Business context"
              description="Memory injected into every carousel chat."
            />

            <Field label="Summary" hint="One-sentence elevator pitch.">
              <textarea
                value={draftContext.summary}
                onChange={(e) =>
                  setDraftContext({ ...draftContext, summary: e.target.value })
                }
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
                value={draftContext.audience}
                onChange={(e) =>
                  setDraftContext({ ...draftContext, audience: e.target.value })
                }
                placeholder="Founders of language schools in Spain and Ireland..."
                rows={3}
                className={textareaClass}
              />
            </Field>

            <Field label="Products / services">
              <textarea
                value={draftContext.products}
                onChange={(e) =>
                  setDraftContext({ ...draftContext, products: e.target.value })
                }
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
                value={draftContext.tone}
                onChange={(e) =>
                  setDraftContext({ ...draftContext, tone: e.target.value })
                }
                placeholder="Expert, direct, no fluff."
              />
            </Field>

            <Field
              label="Key messages"
              hint="Recurring talking points that should show up across carousels."
            >
              <div className="space-y-2">
                {draftContext.keyMessages.map((msg, i) => (
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
                {draftContext.differentiators.map((d, i) => (
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
                value={draftContext.competitors}
                onChange={(e) =>
                  setDraftContext({
                    ...draftContext,
                    competitors: e.target.value,
                  })
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
                value={draftContext.notes}
                onChange={(e) =>
                  setDraftContext({ ...draftContext, notes: e.target.value })
                }
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
          </section>
        </div>
      </div>
    </div>
  );
}

const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y";

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="border-b border-border pb-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
  );
}

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
