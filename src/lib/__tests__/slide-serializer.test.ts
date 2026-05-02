import { describe, expect, it } from "vitest";
import { serializeSlideToHtml } from "@/lib/slide-serializer";
import type { SerializableSlide } from "@/lib/slide-serializer";
import type { ContainerElement } from "@/types/slide-model";

function makeSlide(el: ContainerElement): SerializableSlide {
  return {
    background: { kind: "solid", color: "#ffffff" },
    elements: [el],
    legacyHtml: undefined,
  };
}

function makeContainer(overrides: Partial<ContainerElement> = {}): ContainerElement {
  return {
    kind: "container",
    id: "el-1",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    htmlContent: "<p>plain</p>",
    ...overrides,
  };
}

describe("renderContainer — interpolation", () => {
  it("interpolates {{key}} in htmlContent", () => {
    const el = makeContainer({
      htmlContent: "<p>Hi {{name}}</p>",
      parameters: { name: "Ana" },
    });
    const html = serializeSlideToHtml(makeSlide(el), "4:5");
    expect(html).toContain("<p>Hi Ana</p>");
    expect(html).not.toContain("{{name}}");
  });

  it("interpolates {{key}} in scssStyles", () => {
    const el = makeContainer({
      htmlContent: "<p>text</p>",
      scssStyles: ".x { color: {{c}}; }",
      parameters: { c: "red" },
    });
    const html = serializeSlideToHtml(makeSlide(el), "4:5");
    expect(html).toContain("color: red");
    expect(html).not.toContain("{{c}}");
  });

  it("interpolates both htmlContent and scssStyles using the same key", () => {
    const el = makeContainer({
      htmlContent: "<p style=\"color:{{color}}\">text</p>",
      scssStyles: ".x { background: {{color}}; }",
      parameters: { color: "blue" },
    });
    const html = serializeSlideToHtml(makeSlide(el), "4:5");
    expect(html).toContain("color:blue");
    expect(html).toContain("background: blue");
    expect(html).not.toContain("{{color}}");
  });

  it("renders htmlContent verbatim when parameters is undefined", () => {
    const el = makeContainer({ htmlContent: "<p>plain</p>" });
    const html = serializeSlideToHtml(makeSlide(el), "4:5");
    expect(html).toContain("<p>plain</p>");
  });

  it("keeps missing key literal in output (does not error or empty)", () => {
    const el = makeContainer({
      htmlContent: "<p>{{missing}}</p>",
      parameters: {},
    });
    const html = serializeSlideToHtml(makeSlide(el), "4:5");
    expect(html).toContain("{{missing}}");
  });

  it("data-element-id attribute is present and equals the element id", () => {
    const el = makeContainer({ id: "my-el-42" });
    const html = serializeSlideToHtml(makeSlide(el), "4:5");
    expect(html).toContain('data-element-id="my-el-42"');
  });
});
