import { describe, expect, it } from "vitest";
import { interpolate, extractParameterKeys } from "@/lib/component-interpolation";

describe("interpolate", () => {
  it("replaces a simple key", () => {
    expect(interpolate("Hello {{name}}!", { name: "World" })).toBe("Hello World!");
  });

  it("tolerates whitespace inside braces", () => {
    expect(interpolate("{{  name  }}", { name: "x" })).toBe("x");
  });

  it("leaves literal when key is missing from params", () => {
    expect(interpolate("{{foo}}", {})).toBe("{{foo}}");
  });

  it("does not match broken open brace: { {foo}}", () => {
    expect(interpolate("{ {foo}}", { foo: "bar" })).toBe("{ {foo}}");
  });

  it("does not match empty braces: {{ }}", () => {
    expect(interpolate("{{ }}", { "": "oops" })).toBe("{{ }}");
  });

  it("does not match digit-leading key: {{1foo}}", () => {
    expect(interpolate("{{1foo}}", { "1foo": "x" })).toBe("{{1foo}}");
  });

  it("does not match hyphenated key: {{foo-bar}}", () => {
    expect(interpolate("{{foo-bar}}", { "foo-bar": "x" })).toBe("{{foo-bar}}");
  });

  it("works on multiline strings", () => {
    expect(interpolate("a\n{{x}}\nb", { x: "y" })).toBe("a\ny\nb");
  });

  it("handles CSS scenario with repeated key", () => {
    expect(interpolate(".btn{color:{{c}};background:{{c}}}", { c: "red" })).toBe(
      ".btn{color:red;background:red}",
    );
  });
});

describe("extractParameterKeys", () => {
  it("returns keys in order of first appearance, deduplicated across sources", () => {
    expect(
      extractParameterKeys("a {{x}} b", ".c{color:{{y}};background:{{x}}}"),
    ).toEqual(["x", "y"]);
  });

  it("returns empty array when no params are present", () => {
    expect(extractParameterKeys("no params here")).toEqual([]);
  });

  it("deduplicates keys within a single source", () => {
    expect(extractParameterKeys("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });

  it("handles multiple sources with disjoint keys", () => {
    expect(extractParameterKeys("{{x}}", "{{y}}", "{{z}}")).toEqual(["x", "y", "z"]);
  });
});
