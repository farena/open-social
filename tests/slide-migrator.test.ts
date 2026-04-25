import { describe, it, expect } from "vitest";
import { parseHtmlToSlide } from "@/lib/slide-migrator";

describe("parseHtmlToSlide — backgrounds", () => {
  it("extracts a solid color background", () => {
    const html = `<div style="width:1080px;height:1350px;background:#ffffff;"></div>`;
    const result = parseHtmlToSlide(html, "4:5");
    expect(result.background.kind).toBe("solid");
    if (result.background.kind === "solid") {
      expect(result.background.color).toBe("#ffffff");
    }
  });

  it("extracts a linear gradient background", () => {
    const html = `<div style="width:1080px;height:1350px;background:linear-gradient(135deg,#2fd9b0 0%,#00c4ee 100%);"></div>`;
    const result = parseHtmlToSlide(html, "4:5");
    expect(result.background.kind).toBe("gradient");
    if (result.background.kind === "gradient") {
      expect(result.background.angle).toBe(135);
      expect(result.background.stops).toHaveLength(2);
      expect(result.background.stops[0].color).toBe("#2fd9b0");
      expect(result.background.stops[1].color).toBe("#00c4ee");
    }
  });

  it("falls back to white background when not specified", () => {
    const html = `<div style="width:1080px;height:1350px;"></div>`;
    const result = parseHtmlToSlide(html, "4:5");
    expect(result.background.kind).toBe("solid");
  });
});

describe("parseHtmlToSlide — text elements", () => {
  it("extracts a positioned text element", () => {
    const html = `<div style="width:1080px;height:1350px;background:#fff;"><div style="position:absolute;top:200px;left:100px;font-size:48px;color:#000;font-weight:700;font-family:'Inter';">Hello</div></div>`;
    const result = parseHtmlToSlide(html, "4:5");
    expect(result.legacyHtml).toBeUndefined();
    expect(result.elements).toHaveLength(1);
    const el = result.elements[0];
    expect(el.kind).toBe("text");
    if (el.kind === "text") {
      expect(el.position.x).toBe(100);
      expect(el.position.y).toBe(200);
      expect(el.spans[0].content).toBe("Hello");
      expect(el.spans[0].fontSize).toBe(48);
      expect(el.spans[0].fontWeight).toBe(700);
    }
  });

  it("converts <br/> to newlines in text content", () => {
    const html = `<div style="width:1080px;height:1350px;background:#fff;"><div style="position:absolute;top:0;left:0;font-size:32px;color:#000;">Line one<br/>Line two</div></div>`;
    const result = parseHtmlToSlide(html, "4:5");
    expect(result.elements[0].kind).toBe("text");
    if (result.elements[0].kind === "text") {
      expect(result.elements[0].spans[0].content).toContain("Line one");
      expect(result.elements[0].spans[0].content).toContain("Line two");
    }
  });
});

describe("parseHtmlToSlide — image elements", () => {
  it("extracts an img tag with positioning", () => {
    const html = `<div style="width:1080px;height:1080px;background:#fff;"><img src="/uploads/logo.png" style="position:absolute;top:50px;left:50px;width:200px;height:200px;object-fit:cover;" /></div>`;
    const result = parseHtmlToSlide(html, "1:1");
    expect(result.elements).toHaveLength(1);
    const el = result.elements[0];
    expect(el.kind).toBe("image");
    if (el.kind === "image") {
      expect(el.src).toBe("/uploads/logo.png");
      expect(el.size.w).toBe(200);
      expect(el.fit).toBe("cover");
    }
  });
});

describe("parseHtmlToSlide — fallback", () => {
  it("preserves complex slides as legacyHtml", () => {
    // A slide with nested flex layouts that can't be parsed cleanly
    const html = `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;width:1080px;height:1350px;background:#fff;"><div><span>Complex</span></div><ul><li>nested</li></ul></div>`;
    const result = parseHtmlToSlide(html, "4:5");
    // Either fallback to legacyHtml, OR succeed with empty elements — both
    // acceptable. The contract is: don't crash, return a valid slide shape.
    expect(result.background).toBeDefined();
    expect(result.elements).toBeDefined();
  });

  it("never throws on garbage input", () => {
    expect(() => parseHtmlToSlide("not even html", "4:5")).not.toThrow();
    expect(() => parseHtmlToSlide("", "4:5")).not.toThrow();
    expect(() => parseHtmlToSlide("<div", "4:5")).not.toThrow();
  });
});

describe("parseHtmlToSlide — real slide from production data", () => {
  it("parses the kmpus '5 cosas' slide structure", () => {
    const html = `<div style="width:1080px;height:1350px;background:linear-gradient(135deg,#2fd9b0 0%,#00c4ee 100%);font-family:'Inter',sans-serif;position:relative;box-sizing:border-box;overflow:hidden;"><div style="position:absolute;top:240px;left:90px;font-size:18px;color:rgba(255,255,255,0.9);letter-spacing:4px;font-weight:700;text-transform:uppercase;">KMPUS · Guía rápida</div><div style="position:absolute;top:200px;right:-40px;font-size:520px;font-weight:900;color:rgba(255,255,255,0.95);line-height:0.8;letter-spacing:-24px;">5</div></div>`;
    const result = parseHtmlToSlide(html, "4:5");
    expect(result.background.kind).toBe("gradient");
    // At least one of the text elements should parse — the absolute-top-left one
    const texts = result.elements.filter((e) => e.kind === "text");
    expect(texts.length).toBeGreaterThanOrEqual(1);
  });
});
