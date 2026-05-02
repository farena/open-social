import { describe, expect, it } from "vitest";
import {
  componentSchema,
  componentCreateSchema,
  componentPatchSchema,
  componentParameterSchema,
} from "@/lib/component-schema";
import {
  containerElementSchema,
  elementPatchSchema,
} from "@/lib/slide-schema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validParameter = {
  key: "primaryColor",
  type: "color",
  defaultValue: "#ff0000",
};

const validComponent = {
  id: "comp-001",
  name: "Hero Card",
  description: "A bold hero card component",
  htmlContent: "<div class='hero'>{{title}}</div>",
  scssStyles: ".hero { color: {{primaryColor}}; }",
  parametersSchema: [validParameter],
  width: 400,
  height: 300,
  thumbnailUrl: "/uploads/component-thumbs/comp-001.png",
  tags: ["hero", "card"],
  createdAt: "2026-05-02T13:00:00.000Z",
  updatedAt: "2026-05-02T13:00:00.000Z",
};

// ---------------------------------------------------------------------------
// 1. Valid component round-trips through componentSchema.parse()
// ---------------------------------------------------------------------------

describe("componentSchema", () => {
  it("parses a valid component without throwing", () => {
    const result = componentSchema.parse(validComponent);
    expect(result.id).toBe("comp-001");
    expect(result.name).toBe("Hero Card");
    expect(result.parametersSchema).toHaveLength(1);
    expect(result.parametersSchema[0].key).toBe("primaryColor");
    expect(result.tags).toEqual(["hero", "card"]);
  });

  it("accepts null for description and thumbnailUrl", () => {
    const result = componentSchema.parse({
      ...validComponent,
      description: null,
      thumbnailUrl: null,
    });
    expect(result.description).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
  });

  it("accepts empty arrays for parametersSchema and tags", () => {
    const result = componentSchema.parse({
      ...validComponent,
      parametersSchema: [],
      tags: [],
    });
    expect(result.parametersSchema).toEqual([]);
    expect(result.tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Invalid `type` value → throws
// ---------------------------------------------------------------------------

describe("componentParameterSchema — invalid type", () => {
  it('rejects type "boolean"', () => {
    expect(() =>
      componentParameterSchema.parse({
        key: "foo",
        type: "boolean",
      }),
    ).toThrow();
  });

  it('rejects type "number"', () => {
    expect(() =>
      componentParameterSchema.parse({
        key: "foo",
        type: "number",
      }),
    ).toThrow();
  });

  it('accepts type "text"', () => {
    const result = componentParameterSchema.parse({ key: "foo", type: "text" });
    expect(result.type).toBe("text");
  });

  it('accepts type "color"', () => {
    const result = componentParameterSchema.parse({ key: "foo", type: "color" });
    expect(result.type).toBe("color");
  });

  it('accepts type "image-url"', () => {
    const result = componentParameterSchema.parse({ key: "foo", type: "image-url" });
    expect(result.type).toBe("image-url");
  });
});

// ---------------------------------------------------------------------------
// 3. Invalid key patterns → throw
// ---------------------------------------------------------------------------

describe("componentParameterSchema — invalid key patterns", () => {
  it('rejects key starting with a digit: "1foo"', () => {
    expect(() =>
      componentParameterSchema.parse({ key: "1foo", type: "text" }),
    ).toThrow();
  });

  it('rejects key with hyphens: "foo-bar"', () => {
    expect(() =>
      componentParameterSchema.parse({ key: "foo-bar", type: "text" }),
    ).toThrow();
  });

  it("rejects key with spaces", () => {
    expect(() =>
      componentParameterSchema.parse({ key: "foo bar", type: "text" }),
    ).toThrow();
  });

  it("rejects empty key", () => {
    expect(() =>
      componentParameterSchema.parse({ key: "", type: "text" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Valid key patterns → pass
// ---------------------------------------------------------------------------

describe("componentParameterSchema — valid key patterns", () => {
  const validKeys = ["foo", "_foo", "foo123", "Foo_Bar"];

  for (const key of validKeys) {
    it(`accepts key "${key}"`, () => {
      const result = componentParameterSchema.parse({ key, type: "text" });
      expect(result.key).toBe(key);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. componentPatchSchema accepts partial fields
// ---------------------------------------------------------------------------

describe("componentPatchSchema", () => {
  it('accepts {name: "new"} alone (partial)', () => {
    const result = componentPatchSchema.parse({ name: "new" });
    expect(result.name).toBe("new");
  });

  it("accepts an empty object (all optional)", () => {
    const result = componentPatchSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts multiple optional fields together", () => {
    const result = componentPatchSchema.parse({
      name: "Updated",
      description: "New desc",
      tags: ["new-tag"],
    });
    expect(result.name).toBe("Updated");
    expect(result.description).toBe("New desc");
    expect(result.tags).toEqual(["new-tag"]);
  });

  it("accepts thumbnailUrl in patch", () => {
    const result = componentPatchSchema.parse({ thumbnailUrl: "/uploads/thumb.png" });
    expect(result.thumbnailUrl).toBe("/uploads/thumb.png");
  });
});

// ---------------------------------------------------------------------------
// 6. componentCreateSchema rejects missing width or height
// ---------------------------------------------------------------------------

describe("componentCreateSchema", () => {
  const validCreate = {
    name: "Button",
    htmlContent: "<button>Click</button>",
    width: 200,
    height: 50,
  };

  it("parses a valid create payload", () => {
    const result = componentCreateSchema.parse(validCreate);
    expect(result.name).toBe("Button");
    expect(result.width).toBe(200);
    expect(result.height).toBe(50);
  });

  it("rejects missing width", () => {
    const { width: _w, ...noWidth } = validCreate;
    void _w;
    expect(() => componentCreateSchema.parse(noWidth)).toThrow();
  });

  it("rejects missing height", () => {
    const { height: _h, ...noHeight } = validCreate;
    void _h;
    expect(() => componentCreateSchema.parse(noHeight)).toThrow();
  });

  it("rejects missing name", () => {
    const { name: _n, ...noName } = validCreate;
    void _n;
    expect(() => componentCreateSchema.parse(noName)).toThrow();
  });

  it("rejects missing htmlContent", () => {
    const { htmlContent: _h, ...noHtml } = validCreate;
    void _h;
    expect(() => componentCreateSchema.parse(noHtml)).toThrow();
  });

  it("accepts optional fields: description, scssStyles, parametersSchema, tags", () => {
    const result = componentCreateSchema.parse({
      ...validCreate,
      description: "A button",
      scssStyles: "button { color: red; }",
      parametersSchema: [{ key: "label", type: "text" }],
      tags: ["ui"],
    });
    expect(result.description).toBe("A button");
    expect(result.scssStyles).toBe("button { color: red; }");
    expect(result.parametersSchema).toHaveLength(1);
    expect(result.tags).toEqual(["ui"]);
  });
});

// ---------------------------------------------------------------------------
// 7. ContainerElement — parameters and parameterTypes round-trips
// ---------------------------------------------------------------------------

/** Minimal valid container object for containerElementSchema. */
const validContainer = {
  id: "el-001",
  kind: "container" as const,
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  htmlContent: "<p>Hello</p>",
};

describe("containerElementSchema — parameters field", () => {
  it("parses a valid container without parameters (backward compatible)", () => {
    const result = containerElementSchema.parse(validContainer);
    expect(result.id).toBe("el-001");
    expect(result.parameters).toBeUndefined();
    expect(result.parameterTypes).toBeUndefined();
  });

  it('parses a container with valid parameters: {primary: "#ff0000"}', () => {
    const result = containerElementSchema.parse({
      ...validContainer,
      parameters: { primary: "#ff0000" },
    });
    expect(result.parameters).toEqual({ primary: "#ff0000" });
  });

  it('rejects a container with an invalid parameter key: "1bad"', () => {
    expect(() =>
      containerElementSchema.parse({
        ...validContainer,
        parameters: { "1bad": "x" },
      }),
    ).toThrow();
  });

  it("rejects a key with hyphens in parameters", () => {
    expect(() =>
      containerElementSchema.parse({
        ...validContainer,
        parameters: { "foo-bar": "x" },
      }),
    ).toThrow();
  });
});

describe("containerElementSchema — parameterTypes field", () => {
  it('parses a container with valid parameterTypes: {c: "color"}', () => {
    const result = containerElementSchema.parse({
      ...validContainer,
      parameterTypes: { c: "color" },
    });
    expect(result.parameterTypes).toEqual({ c: "color" });
  });

  it("accepts all valid ParameterType values", () => {
    const result = containerElementSchema.parse({
      ...validContainer,
      parameterTypes: { a: "text", b: "color", c: "image-url" },
    });
    expect(result.parameterTypes).toEqual({ a: "text", b: "color", c: "image-url" });
  });

  it('rejects an invalid ParameterType value: "boolean"', () => {
    expect(() =>
      containerElementSchema.parse({
        ...validContainer,
        parameterTypes: { c: "boolean" },
      }),
    ).toThrow();
  });

  it("rejects an invalid key in parameterTypes", () => {
    expect(() =>
      containerElementSchema.parse({
        ...validContainer,
        parameterTypes: { "1bad": "color" },
      }),
    ).toThrow();
  });
});

describe("containerElementSchema — parameters + parameterTypes together", () => {
  it("parses a container with both fields set", () => {
    const result = containerElementSchema.parse({
      ...validContainer,
      parameters: { primary: "#ff0000", label: "Hello" },
      parameterTypes: { primary: "color", label: "text" },
    });
    expect(result.parameters).toEqual({ primary: "#ff0000", label: "Hello" });
    expect(result.parameterTypes).toEqual({ primary: "color", label: "text" });
  });
});

describe("elementPatchSchema — parameters and parameterTypes fields", () => {
  it("accepts {parameters: {x: 'y'}} alone (partial patch)", () => {
    const result = elementPatchSchema.parse({ parameters: { x: "y" } });
    expect(result.parameters).toEqual({ x: "y" });
  });

  it("accepts {parameterTypes: {x: 'color'}} alone (partial patch)", () => {
    const result = elementPatchSchema.parse({ parameterTypes: { x: "color" } });
    expect(result.parameterTypes).toEqual({ x: "color" });
  });

  it("accepts an empty object (all fields optional)", () => {
    const result = elementPatchSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects invalid key in parameters patch", () => {
    expect(() =>
      elementPatchSchema.parse({ parameters: { "bad-key": "value" } }),
    ).toThrow();
  });

  it("rejects invalid ParameterType in parameterTypes patch", () => {
    expect(() =>
      elementPatchSchema.parse({ parameterTypes: { x: "boolean" } }),
    ).toThrow();
  });
});
