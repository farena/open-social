import { describe, it, expect } from "vitest";
import { serializeSlideToHtml } from "@/lib/slide-serializer";
import type { Slide } from "@/types/carousel";

const baseSlide = (overrides: Partial<Slide> = {}): Slide => ({
  id: "s-test",
  order: 0,
  notes: "",
  background: { kind: "solid", color: "#ffffff" },
  elements: [],
  previousVersions: [],
  ...overrides,
});

describe("serializeSlideToHtml", () => {
  it("returns legacyHtml as-is when present (escape hatch)", () => {
    const slide = baseSlide({ legacyHtml: "<div>legacy content</div>" });
    expect(serializeSlideToHtml(slide, "4:5")).toBe("<div>legacy content</div>");
  });

  it("renders a solid background", () => {
    const html = serializeSlideToHtml(baseSlide(), "4:5");
    expect(html).toContain("background: #ffffff");
    expect(html).toContain("width: 1080px");
    expect(html).toContain("height: 1350px");
    expect(html).toContain("data-slide-root");
  });

  it("renders a gradient background", () => {
    const slide = baseSlide({
      background: {
        kind: "gradient",
        angle: 135,
        stops: [
          { offset: 0, color: "#2fd9b0" },
          { offset: 1, color: "#00c4ee" },
        ],
      },
    });
    const html = serializeSlideToHtml(slide, "4:5");
    expect(html).toMatch(/linear-gradient\(135deg,\s*#2fd9b0\s+0%,\s*#00c4ee\s+100%\)/);
  });

  it("renders an image background with cover fit", () => {
    const slide = baseSlide({
      background: { kind: "image", src: "/uploads/bg.jpg", fit: "cover" },
    });
    const html = serializeSlideToHtml(slide, "4:5");
    expect(html).toContain("/uploads/bg.jpg");
    expect(html).toContain("background-size: cover");
  });

  it("renders a text element with one span", () => {
    const slide = baseSlide({
      elements: [
        {
          id: "t1",
          kind: "text",
          position: { x: 100, y: 200 },
          size: { w: 800, h: 100 },
          alignment: "center",
          lineHeight: 1.2,
          spans: [
            {
              content: "Hello world",
              fontFamily: "Inter",
              fontSize: 48,
              fontWeight: 700,
              color: "#111111",
            },
          ],
        },
      ],
    });
    const html = serializeSlideToHtml(slide, "4:5");
    expect(html).toContain('data-element-id="t1"');
    expect(html).toContain('data-element-kind="text"');
    expect(html).toContain("position: absolute");
    expect(html).toContain("left: 100px");
    expect(html).toContain("top: 200px");
    expect(html).toContain("width: 800px");
    expect(html).toContain("Hello world");
    expect(html).toContain("font-family: 'Inter'");
    expect(html).toContain("font-size: 48px");
    expect(html).toContain("font-weight: 700");
    expect(html).toContain("color: #111111");
  });

  it("renders a text element with multiple spans (rich text)", () => {
    const slide = baseSlide({
      elements: [
        {
          id: "t1",
          kind: "text",
          position: { x: 0, y: 0 },
          size: { w: 800, h: "auto" },
          alignment: "left",
          lineHeight: 1.2,
          spans: [
            { content: "Solo ", fontFamily: "Inter", fontSize: 32, fontWeight: 400, color: "#000" },
            { content: "vos", fontFamily: "Inter", fontSize: 32, fontWeight: 700, color: "#ff0000" },
            { content: " podés", fontFamily: "Inter", fontSize: 32, fontWeight: 400, color: "#000" },
          ],
        },
      ],
    });
    const html = serializeSlideToHtml(slide, "4:5");
    expect(html).toContain("Solo ");
    expect(html).toContain("vos");
    expect(html).toContain(" podés");
    // The middle span should have its own styles
    const matches = html.match(/<span[^>]*>vos<\/span>/);
    expect(matches).not.toBeNull();
    expect(matches![0]).toContain("color: #ff0000");
    expect(matches![0]).toContain("font-weight: 700");
  });

  it("renders an image element", () => {
    const slide = baseSlide({
      elements: [
        {
          id: "i1",
          kind: "image",
          position: { x: 50, y: 50 },
          size: { w: 200, h: 200 },
          src: "/uploads/logo.png",
          fit: "cover",
          borderRadius: 16,
        },
      ],
    });
    const html = serializeSlideToHtml(slide, "1:1");
    expect(html).toContain('data-element-kind="image"');
    expect(html).toContain('src="/uploads/logo.png"');
    expect(html).toContain("object-fit: cover");
    expect(html).toContain("border-radius: 16px");
  });

  it("renders a rect shape with solid fill", () => {
    const slide = baseSlide({
      elements: [
        {
          id: "sh1",
          kind: "shape",
          position: { x: 0, y: 0 },
          size: { w: 100, h: 100 },
          shape: "rect",
          fill: { kind: "solid", color: "#2fd9b0" },
        },
      ],
    });
    const html = serializeSlideToHtml(slide, "1:1");
    expect(html).toContain('data-element-kind="shape"');
    expect(html).toContain("background: #2fd9b0");
  });

  it("renders a circle shape", () => {
    const slide = baseSlide({
      elements: [
        {
          id: "sh1",
          kind: "shape",
          position: { x: 0, y: 0 },
          size: { w: 100, h: 100 },
          shape: "circle",
          fill: { kind: "solid", color: "#000" },
          borderRadius: 50,
        },
      ],
    });
    const html = serializeSlideToHtml(slide, "1:1");
    expect(html).toContain("border-radius: 50%");
  });

  it("renders a shape with gradient fill", () => {
    const slide = baseSlide({
      elements: [
        {
          id: "sh1",
          kind: "shape",
          position: { x: 0, y: 0 },
          size: { w: 100, h: 100 },
          shape: "rect",
          fill: {
            kind: "gradient",
            angle: 90,
            stops: [
              { offset: 0, color: "#000" },
              { offset: 1, color: "#fff" },
            ],
          },
        },
      ],
    });
    const html = serializeSlideToHtml(slide, "1:1");
    expect(html).toMatch(/linear-gradient\(90deg/);
  });

  it("respects element order (z-index)", () => {
    const slide = baseSlide({
      elements: [
        {
          id: "back",
          kind: "shape",
          position: { x: 0, y: 0 },
          size: { w: 100, h: 100 },
          shape: "rect",
          fill: { kind: "solid", color: "#000" },
        },
        {
          id: "front",
          kind: "shape",
          position: { x: 0, y: 0 },
          size: { w: 100, h: 100 },
          shape: "rect",
          fill: { kind: "solid", color: "#fff" },
        },
      ],
    });
    const html = serializeSlideToHtml(slide, "1:1");
    const backIdx = html.indexOf('data-element-id="back"');
    const frontIdx = html.indexOf('data-element-id="front"');
    // Later in array = later in HTML = higher z (CSS stacking)
    expect(backIdx).toBeLessThan(frontIdx);
  });

  it("escapes HTML in text content", () => {
    const slide = baseSlide({
      elements: [
        {
          id: "t1",
          kind: "text",
          position: { x: 0, y: 0 },
          size: { w: 800, h: 100 },
          alignment: "left",
          lineHeight: 1.2,
          spans: [
            {
              content: "<script>alert('xss')</script>",
              fontFamily: "Inter",
              fontSize: 16,
              fontWeight: 400,
              color: "#000",
            },
          ],
        },
      ],
    });
    const html = serializeSlideToHtml(slide, "4:5");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses correct dimensions per aspect ratio", () => {
    expect(serializeSlideToHtml(baseSlide(), "1:1")).toContain("height: 1080px");
    expect(serializeSlideToHtml(baseSlide(), "4:5")).toContain("height: 1350px");
    expect(serializeSlideToHtml(baseSlide(), "9:16")).toContain("height: 1920px");
  });
});
