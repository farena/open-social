import { NextResponse } from "next/server";
import { appendSlide, reorderSlides } from "@/lib/content-items";
import { newSlideInputSchema } from "@/lib/slide-schema";
import { createDefaultBackground } from "@/lib/slide-defaults";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();

    // Transitional fallback: clients that still send { html } get their
    // payload wrapped as legacyHtml.
    if (
      body &&
      typeof body === "object" &&
      typeof body.html === "string" &&
      !body.background &&
      !body.elements
    ) {
      const item = await appendSlide(id, {
        background: createDefaultBackground(),
        elements: [],
        legacyHtml: body.html,
        notes: typeof body.notes === "string" ? body.notes : "",
      });
      if (!item) {
        return NextResponse.json(
          { error: "Content item not found or max slides reached" },
          { status: 400 }
        );
      }
      return NextResponse.json(item, { status: 201 });
    }

    const parsed = newSlideInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid slide payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const item = await appendSlide(id, parsed.data);
    if (!item) {
      return NextResponse.json(
        { error: "Content item not found or max slides reached" },
        { status: 400 }
      );
    }
    return NextResponse.json(item, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { slideIds } = body as { slideIds?: string[] };

    if (!Array.isArray(slideIds)) {
      return NextResponse.json(
        { error: "slideIds array is required" },
        { status: 400 }
      );
    }

    const item = await reorderSlides(id, slideIds);
    if (!item) {
      return NextResponse.json(
        { error: "Content item not found or invalid slide IDs" },
        { status: 404 }
      );
    }

    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
