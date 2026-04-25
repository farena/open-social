import { NextResponse } from "next/server";
import { addSlide, reorderSlides, getCarousel } from "@/lib/carousels";
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
    // payload wrapped as legacyHtml. The migrator (Phase 3) will replace this
    // with proper parsing when the IA prompt is updated.
    if (
      body &&
      typeof body === "object" &&
      typeof body.html === "string" &&
      !body.background &&
      !body.elements
    ) {
      const slide = await addSlide(id, {
        background: createDefaultBackground(),
        elements: [],
        legacyHtml: body.html,
        notes: typeof body.notes === "string" ? body.notes : "",
      });
      if (!slide) {
        return NextResponse.json(
          { error: "Carousel not found or max slides reached" },
          { status: 400 }
        );
      }
      return NextResponse.json(slide, { status: 201 });
    }

    const parsed = newSlideInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid slide payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const slide = await addSlide(id, parsed.data);
    if (!slide) {
      return NextResponse.json(
        { error: "Carousel not found or max slides reached" },
        { status: 400 }
      );
    }
    return NextResponse.json(slide, { status: 201 });
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

    const success = await reorderSlides(id, slideIds);
    if (!success) {
      return NextResponse.json(
        { error: "Carousel not found or invalid slide IDs" },
        { status: 400 }
      );
    }

    const carousel = await getCarousel(id);
    return NextResponse.json({ slides: carousel?.slides ?? [] });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
