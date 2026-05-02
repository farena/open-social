import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Mock Puppeteer — must be hoisted before any import that touches it
// ---------------------------------------------------------------------------

const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("fake-png"));
const mockSetContent = vi.fn().mockResolvedValue(undefined);
const mockSetViewport = vi.fn().mockResolvedValue(undefined);
const mockEvaluate = vi.fn().mockResolvedValue(undefined);
const mockPageClose = vi.fn().mockResolvedValue(undefined);
const mockBrowserClose = vi.fn().mockResolvedValue(undefined);

const mockNewPage = vi.fn().mockResolvedValue({
  setViewport: mockSetViewport,
  setContent: mockSetContent,
  evaluate: mockEvaluate,
  screenshot: mockScreenshot,
  close: mockPageClose,
});

const mockLaunch = vi.fn().mockResolvedValue({
  newPage: mockNewPage,
  isConnected: () => true,
  close: mockBrowserClose,
});

vi.mock("puppeteer", () => ({
  default: { launch: mockLaunch },
}));

// ---------------------------------------------------------------------------
// DB lifecycle — fresh DB per test
// ---------------------------------------------------------------------------

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-thumb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  process.env.TEST_DB_PATH = tempDbPath;

  // Reset all mocks between tests
  vi.clearAllMocks();
  mockScreenshot.mockResolvedValue(Buffer.from("fake-png"));
  mockSetContent.mockResolvedValue(undefined);
  mockSetViewport.mockResolvedValue(undefined);
  mockEvaluate.mockResolvedValue(undefined);
  mockPageClose.mockResolvedValue(undefined);
  mockNewPage.mockResolvedValue({
    setViewport: mockSetViewport,
    setContent: mockSetContent,
    evaluate: mockEvaluate,
    screenshot: mockScreenshot,
    close: mockPageClose,
  });
  mockLaunch.mockResolvedValue({
    newPage: mockNewPage,
    isConnected: () => true,
    close: mockBrowserClose,
  });
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db");
  closeDb();
  for (const ext of ["", "-wal", "-shm"]) {
    const f = tempDbPath + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  delete process.env.TEST_DB_PATH;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComponent(overrides: Record<string, unknown> = {}) {
  return {
    id: "comp-1",
    name: "Test",
    description: null,
    htmlContent: "<p>Hello</p>",
    scssStyles: "",
    parametersSchema: [],
    width: 400,
    height: 300,
    thumbnailUrl: null,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateComponentThumbnail", () => {
  it("returns a public path of the form /uploads/component-thumbs/{id}.png", async () => {
    const { generateComponentThumbnail } = await import(
      "@/lib/component-thumbnail"
    );
    const component = makeComponent({ id: "abc-123" });
    const result = await generateComponentThumbnail(component as never);
    expect(result).toBe("/uploads/component-thumbs/abc-123.png");
  });

  it("interpolates parametersSchema defaultValues into htmlContent before rendering", async () => {
    const { generateComponentThumbnail } = await import(
      "@/lib/component-thumbnail"
    );

    const component = makeComponent({
      id: "comp-interp",
      htmlContent: "<p>{{name}}</p>",
      parametersSchema: [
        { key: "name", type: "text", defaultValue: "Hello" },
      ],
    });

    await generateComponentThumbnail(component as never);

    // The HTML passed to setContent must contain the interpolated value
    expect(mockSetContent).toHaveBeenCalledOnce();
    const htmlArg: string = mockSetContent.mock.calls[0][0];
    expect(htmlArg).toContain("<p>Hello</p>");
    expect(htmlArg).not.toContain("{{name}}");
  });

  it("replaces parameters without defaultValue with empty string", async () => {
    const { generateComponentThumbnail } = await import(
      "@/lib/component-thumbnail"
    );

    const component = makeComponent({
      id: "comp-empty",
      htmlContent: "<p>{{title}}</p>",
      parametersSchema: [{ key: "title", type: "text" }],
    });

    await generateComponentThumbnail(component as never);

    const htmlArg: string = mockSetContent.mock.calls[0][0];
    expect(htmlArg).toContain("<p></p>");
    expect(htmlArg).not.toContain("{{title}}");
  });

  it("updates thumbnail_url on the DB row after successful generation", async () => {
    const { createComponent } = await import("@/lib/components");
    const { generateComponentThumbnail } = await import(
      "@/lib/component-thumbnail"
    );
    const { getComponent } = await import("@/lib/components");

    const created = await createComponent({
      name: "Thumb Test",
      htmlContent: "<p>Hi</p>",
      scssStyles: "",
      parametersSchema: [],
      width: 200,
      height: 200,
      tags: [],
    });

    await generateComponentThumbnail(created);

    const fetched = await getComponent(created.id);
    expect(fetched?.thumbnailUrl).toBe(
      `/uploads/component-thumbs/${created.id}.png`,
    );
  });

  it("swallows errors without throwing (fire-and-forget safe)", async () => {
    const { createComponent } = await import("@/lib/components");
    const { generateComponentThumbnail } = await import(
      "@/lib/component-thumbnail"
    );
    const { getComponent } = await import("@/lib/components");

    // Make screenshot throw
    mockScreenshot.mockRejectedValue(new Error("Puppeteer crashed"));

    const created = await createComponent({
      name: "Error Test",
      htmlContent: "<p>X</p>",
      scssStyles: "",
      parametersSchema: [],
      width: 100,
      height: 100,
      tags: [],
    });

    // Must not throw
    await expect(
      generateComponentThumbnail(created),
    ).resolves.not.toThrow();

    // thumbnailUrl must remain null
    const fetched = await getComponent(created.id);
    expect(fetched?.thumbnailUrl).toBeNull();
  });
});
