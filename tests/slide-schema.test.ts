import { describe, it, expect } from "vitest";
import {
  spanSchema,
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
  slideElementSchema,
  backgroundSchema,
  slideSchema,
  elementPatchSchema,
} from "@/lib/slide-schema";

describe("spanSchema", () => {
  it("accepts a valid span", () => {
    const result = spanSchema.safeParse({
      content: "Hello",
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 700,
      color: "#000000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects span with missing content", () => {
    const result = spanSchema.safeParse({
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 700,
      color: "#000000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects span with invalid fontWeight", () => {
    const result = spanSchema.safeParse({
      content: "Hello",
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 123,
      color: "#000000",
    });
    expect(result.success).toBe(false);
  });
});

describe("textElementSchema", () => {
  const validText = {
    id: "el-1",
    kind: "text" as const,
    position: { x: 100, y: 200 },
    size: { w: 800, h: 100 },
    alignment: "center" as const,
    lineHeight: 1.2,
    spans: [
      {
        content: "Hello",
        fontFamily: "Inter",
        fontSize: 48,
        fontWeight: 700,
        color: "#111111",
      },
    ],
  };

  it("accepts a valid text element", () => {
    expect(textElementSchema.safeParse(validText).success).toBe(true);
  });

  it("accepts size.h = 'auto'", () => {
    expect(
      textElementSchema.safeParse({ ...validText, size: { w: 800, h: "auto" } })
        .success,
    ).toBe(true);
  });

  it("rejects text element with empty spans array", () => {
    expect(
      textElementSchema.safeParse({ ...validText, spans: [] }).success,
    ).toBe(false);
  });

  it("rejects text element with wrong kind", () => {
    expect(
      textElementSchema.safeParse({ ...validText, kind: "image" }).success,
    ).toBe(false);
  });
});

describe("imageElementSchema", () => {
  const validImage = {
    id: "el-2",
    kind: "image" as const,
    position: { x: 0, y: 0 },
    size: { w: 200, h: 200 },
    src: "/uploads/logo.png",
    fit: "cover" as const,
  };

  it("accepts a valid image", () => {
    expect(imageElementSchema.safeParse(validImage).success).toBe(true);
  });

  it("rejects image with empty src", () => {
    expect(
      imageElementSchema.safeParse({ ...validImage, src: "" }).success,
    ).toBe(false);
  });

  it("rejects image with invalid fit value", () => {
    expect(
      imageElementSchema.safeParse({ ...validImage, fit: "stretch" }).success,
    ).toBe(false);
  });
});

describe("shapeElementSchema", () => {
  const validShape = {
    id: "el-3",
    kind: "shape" as const,
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    shape: "rect" as const,
    fill: { kind: "solid", color: "#ff0000" },
  };

  it("accepts a valid shape", () => {
    expect(shapeElementSchema.safeParse(validShape).success).toBe(true);
  });

  it("rejects shape with invalid shape kind", () => {
    expect(
      shapeElementSchema.safeParse({ ...validShape, shape: "triangle" })
        .success,
    ).toBe(false);
  });

  it("accepts gradient fill", () => {
    const result = shapeElementSchema.safeParse({
      ...validShape,
      fill: {
        kind: "gradient",
        angle: 135,
        stops: [
          { offset: 0, color: "#000000" },
          { offset: 1, color: "#ffffff" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("slideElementSchema (union)", () => {
  it("discriminates by kind", () => {
    const text = {
      id: "1",
      kind: "text",
      position: { x: 0, y: 0 },
      size: { w: 100, h: 100 },
      alignment: "left",
      lineHeight: 1.2,
      spans: [
        {
          content: "x",
          fontFamily: "Inter",
          fontSize: 16,
          fontWeight: 400,
          color: "#000",
        },
      ],
    };
    expect(slideElementSchema.safeParse(text).success).toBe(true);
  });

  it("rejects unknown kind", () => {
    expect(
      slideElementSchema.safeParse({ id: "1", kind: "video" }).success,
    ).toBe(false);
  });
});

describe("backgroundSchema", () => {
  it("accepts solid", () => {
    expect(
      backgroundSchema.safeParse({ kind: "solid", color: "#ffffff" }).success,
    ).toBe(true);
  });

  it("accepts gradient", () => {
    expect(
      backgroundSchema.safeParse({
        kind: "gradient",
        angle: 90,
        stops: [
          { offset: 0, color: "#000" },
          { offset: 1, color: "#fff" },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts image", () => {
    expect(
      backgroundSchema.safeParse({
        kind: "image",
        src: "/uploads/bg.jpg",
        fit: "cover",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown kind", () => {
    expect(backgroundSchema.safeParse({ kind: "video" }).success).toBe(false);
  });
});

describe("slideSchema", () => {
  it("accepts a valid full slide", () => {
    const slide = {
      id: "s-1",
      order: 0,
      notes: "",
      background: { kind: "solid", color: "#fff" },
      elements: [],
      previousVersions: [],
    };
    expect(slideSchema.safeParse(slide).success).toBe(true);
  });

  it("accepts a slide with legacyHtml", () => {
    const slide = {
      id: "s-1",
      order: 0,
      notes: "",
      background: { kind: "solid", color: "#fff" },
      elements: [],
      legacyHtml: "<div>legacy</div>",
      previousVersions: [],
    };
    expect(slideSchema.safeParse(slide).success).toBe(true);
  });
});

describe("elementPatchSchema", () => {
  it("accepts partial position update", () => {
    expect(
      elementPatchSchema.safeParse({ position: { x: 50, y: 50 } }).success,
    ).toBe(true);
  });

  it("accepts empty patch", () => {
    expect(elementPatchSchema.safeParse({}).success).toBe(true);
  });
});
