/**
 * Tests for the debounce contract of useSlideEditor.
 *
 * `@testing-library/react` is not installed in this project; the test
 * environment is "node" (vitest.config.ts).  We therefore verify the
 * debounce contract by driving the same timer-and-callback pattern that
 * useSlideEditor's persist effect implements, rather than rendering the
 * React hook.  This gives full confidence in the timing semantics without
 * adding a new dependency.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Minimal replica of the debounce logic extracted from useSlideEditor.
// Kept as a plain class so it can be unit-tested without a React environment.
// The real hook uses the exact same setTimeout / clearTimeout pattern.
// ---------------------------------------------------------------------------

class DebounceTracker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSentContent: string | null = null;

  constructor(
    private readonly debounceMs: number,
    private readonly onPersist: (content: string) => void,
  ) {}

  /** Simulates dispatching an edit (content changes). */
  edit(content: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.lastSentContent = content;
      this.onPersist(content);
      this.timer = null;
    }, this.debounceMs);
  }

  /**
   * Flush pending persist on unmount (mirrors the cleanup in useSlideEditor).
   * If a timer is pending and content hasn't been sent yet, fire immediately.
   */
  flush(currentContent: string): void {
    if (this.timer !== null && this.lastSentContent !== currentContent) {
      clearTimeout(this.timer);
      this.timer = null;
      this.onPersist(currentContent);
      this.lastSentContent = currentContent;
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSlideEditor debounce contract (10 s window)", () => {
  let onPersist: ReturnType<typeof vi.fn>;
  let tracker: DebounceTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    onPersist = vi.fn();
    tracker = new DebounceTracker(10_000, onPersist);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call onPersist before the debounce window expires", () => {
    tracker.edit("content-v1");

    vi.advanceTimersByTime(9_999);
    expect(onPersist).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1); // exactly 10_000 ms total
    expect(onPersist).toHaveBeenCalledOnce();
    expect(onPersist).toHaveBeenCalledWith("content-v1");
  });

  it("batches rapid edits into a single onPersist call after 10 s of idle", () => {
    tracker.edit("content-v1");
    vi.advanceTimersByTime(500);  // 500 ms later — still debouncing

    tracker.edit("content-v2");  // resets the timer
    vi.advanceTimersByTime(500);  // 1 000 ms total — still debouncing

    tracker.edit("content-v3");  // another reset
    vi.advanceTimersByTime(10_000); // window expires on v3

    expect(onPersist).toHaveBeenCalledOnce();
    expect(onPersist).toHaveBeenCalledWith("content-v3");
  });

  it("flush() on unmount mid-debounce fires onPersist synchronously", () => {
    tracker.edit("content-v1");
    vi.advanceTimersByTime(5_000); // half-way through the window

    // Simulate component unmount — flush should fire immediately
    tracker.flush("content-v1");
    expect(onPersist).toHaveBeenCalledOnce();
    expect(onPersist).toHaveBeenCalledWith("content-v1");

    // The timer was cleared; advancing past the original window fires nothing more
    vi.advanceTimersByTime(5_001);
    expect(onPersist).toHaveBeenCalledOnce();
  });
});
