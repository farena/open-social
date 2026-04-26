"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CarouselPreviewEmpty } from "@/components/editor/CarouselPreview";
import { EditorBody } from "@/components/editor/EditorBody";
import { Toolbar } from "@/components/editor/Toolbar";
import { SlideFilmstrip } from "@/components/editor/SlideFilmstrip";
import { CaptionPanel } from "@/components/editor/CaptionPanel";
import { FullscreenPreview } from "@/components/editor/FullscreenPreview";
import { ContentItemDetailIdea } from "@/components/content/ContentItemDetailIdea";
import { ContentItemDetailModal } from "@/components/content/ContentItemDetailModal";
import type { ContentItem } from "@/types/content-item";
import type { AspectRatio } from "@/types/carousel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ContentItemPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [claudeAvailable, setClaudeAvailable] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data: ContentItem = await res.json();
        setItem((prev) => {
          if (prev && data.slides.length > prev.slides.length) {
            setActiveSlide(data.slides.length - 1);
          } else {
            setActiveSlide((prevIdx) =>
              data.slides.length === 0
                ? 0
                : Math.min(prevIdx, data.slides.length - 1)
            );
          }
          return data;
        });
      }
    } catch {
      // ignore network errors
    }
  }, [id]);

  useEffect(() => {
    const load = async () => {
      await fetchItem();
      try {
        const res = await fetch("/api/chat/check");
        const data: { available?: boolean } = await res.json();
        if (data.available === false) setClaudeAvailable(false);
      } catch {
        // assume available
      }
    };
    load();
  }, [fetchItem]);

  // Poll every 800ms while state === "generating"; stop when state flips to "generated".
  useEffect(() => {
    if (!item || item.state !== "generating") return;
    const interval = setInterval(() => {
      fetchItem();
    }, 800);
    return () => clearInterval(interval);
  }, [item?.state, fetchItem]);

  // Refetch on window focus — handles "user navigated away mid-generation" edge case.
  useEffect(() => {
    const onFocus = () => {
      fetchItem();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchItem]);

  const handleAspectChange = async (ratio: AspectRatio) => {
    if (!item) return;
    const res = await fetch(`/api/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspectRatio: ratio }),
    });
    if (res.ok) {
      const updated: ContentItem = await res.json();
      setItem(updated);
    }
  };

  const handleDeleteSlide = (slideId: string) => {
    if (!item) return;
    const slideIndex = item.slides.findIndex((s) => s.id === slideId);
    setConfirmState({
      open: true,
      title: `Delete slide ${slideIndex + 1}?`,
      description: "This action cannot be undone.",
      onConfirm: async () => {
        const res = await fetch(`/api/content/${id}/slides/${slideId}`, {
          method: "DELETE",
        });
        if (res.ok) await fetchItem();
      },
    });
  };

  const handleUndoSlide = async (slideId: string) => {
    const res = await fetch(`/api/content/${id}/slides/${slideId}/undo`, {
      method: "POST",
    });
    if (res.ok) await fetchItem();
  };

  const handleDeleteItem = useCallback(() => {
    if (!item) return;
    setConfirmState({
      open: true,
      title: `Delete "${item.hook}"?`,
      description: "This will permanently delete this content item and all its slides.",
      onConfirm: async () => {
        const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
        if (res.ok) router.push("/");
      },
    });
  }, [item, id, router]);

  const handleStreamStart = useCallback(() => setIsGenerating(true), []);
  const handleStreamEnd = useCallback(() => {
    setIsGenerating(false);
    fetchItem();
  }, [fetchItem]);

  const handleReorderSlides = useCallback(
    async (slideIds: string[]) => {
      await fetch(`/api/content/${id}/slides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideIds }),
      });
      await fetchItem();
    },
    [id, fetchItem]
  );

  const handleAddSlideRequest = useCallback(() => {
    setChatOpen(true);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  }, []);

  // Called by ContentItemDetailIdea after a successful POST /generate (2xx only)
  const handleGenerateRequested = useCallback(() => {
    if (!item) return;
    // Optimistically switch to editor view — the component already fired the POST
    setItem((prev) =>
      prev ? { ...prev, state: "generating" } : prev
    );
    setIsGenerating(true);
  }, [item]);

  // --- Loading / 404 ---

  if (notFound) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold">Content item not found</p>
        <p className="text-sm text-muted-foreground">
          This item may have been deleted.
        </p>
        <Link href="/" className="text-sm text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // --- Idea state: show form ---

  if (item.state === "idea") {
    return (
      <div className="h-full flex flex-col">
        <TopBar title={item.hook || "Content idea"} showBack />
        <ConfirmDialog
          open={confirmState.open}
          onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={confirmState.onConfirm}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <ContentItemDetailIdea
            contentItem={item}
            onSaved={(updated) => setItem(updated)}
            onGenerateRequested={handleGenerateRequested}
            claudeAvailable={claudeAvailable}
            onItemUpdated={fetchItem}
          />
        </div>
      </div>
    );
  }

  // --- Generating / Generated state: show editor ---

  const toolbar = (
    <Toolbar
      aspectRatio={item.aspectRatio}
      onAspectChange={handleAspectChange}
      showSafeZones={showSafeZones}
      onToggleSafeZones={() => setShowSafeZones(!showSafeZones)}
      onFullscreen={() => setShowFullscreen(true)}
      onSaveTemplate={async () => {
        await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ carouselId: id }),
        });
      }}
      onDeleteCarousel={handleDeleteItem}
      chatOpen={chatOpen}
      onToggleChat={() => setChatOpen(!chatOpen)}
      contentItemId={id}
      slideCount={item.slides.length}
      onViewDetails={item.state === "generated" ? () => setShowDetailsModal(true) : undefined}
    />
  );

  const captionPanel = (
    <CaptionPanel caption={item.caption} hashtags={item.hashtags} />
  );

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title={item.hook || "Content item"}
        showBack
        editable
        onTitleChange={async (hook) => {
          const res = await fetch(`/api/content/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hook }),
          });
          if (res.ok) {
            const updated: ContentItem = await res.json();
            setItem(updated);
          }
        }}
      />

      <FullscreenPreview
        open={showFullscreen}
        onOpenChange={setShowFullscreen}
        slides={item.slides}
        aspectRatio={item.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
      />

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmState.onConfirm}
      />

      <ContentItemDetailModal
        open={showDetailsModal}
        onOpenChange={setShowDetailsModal}
        contentItem={item}
        onSaved={(updated) => setItem(updated)}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden" id="main-editor-area">
        {/* Chat panel */}
        {chatOpen && (
          <div className="oc-fade w-80 border-r border-border shrink-0 flex flex-col bg-surface">
            <ChatPanel
              carouselId={id}
              claudeAvailable={claudeAvailable}
              referenceImages={item.referenceImages ?? []}
              onStreamStart={handleStreamStart}
              onStreamEnd={handleStreamEnd}
              chatInputRef={chatInputRef}
            />
          </div>
        )}

        {item.slides.length === 0 ? (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {toolbar}
            <CarouselPreviewEmpty />
            {captionPanel}
          </div>
        ) : (
          <EditorBody
            contentItemId={id}
            slides={item.slides}
            aspectRatio={item.aspectRatio}
            activeIndex={activeSlide}
            onActiveChange={setActiveSlide}
            showSafeZones={showSafeZones}
            onUndoSlide={handleUndoSlide}
            onSlidePersisted={(updated) => {
              setItem((prev) =>
                prev
                  ? {
                      ...prev,
                      slides: prev.slides.map((s) =>
                        s.id === updated.id ? updated : s
                      ),
                    }
                  : prev
              );
            }}
            toolbar={toolbar}
            belowPreview={captionPanel}
          />
        )}
      </div>

      <SlideFilmstrip
        slides={item.slides}
        aspectRatio={item.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
        onDeleteSlide={handleDeleteSlide}
        onUndoSlide={handleUndoSlide}
        onAddSlideRequest={handleAddSlideRequest}
        onReorderSlides={handleReorderSlides}
        isGenerating={isGenerating}
      />
    </div>
  );
}
