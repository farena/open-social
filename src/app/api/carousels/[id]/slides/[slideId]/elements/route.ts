import { NextResponse } from "next/server";
import { addSlideElement } from "@/lib/carousels";
import { slideElementSchema } from "@/lib/slide-schema";
import { generateId } from "@/lib/utils";
import type { SlideElement } from "@/types/slide-model";

/**
 * POST /api/carousels/:id/slides/:slideId/elements
 *
 * Append a new element to the slide. Body: a full SlideElement
 * (text/image/shape). If `id` is omitted, the server generates one. The
 * appended element ends up on top of the z-stack (last in array).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> },
) {
  const { id, slideId } = await params;
  try {
    const body = await request.json();
    const candidate: unknown =
      body && typeof body === "object" && body !== null && !("id" in body)
        ? { ...(body as Record<string, unknown>), id: generateId() }
        : body;
    const parsed = slideElementSchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid element payload", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const slide = await addSlideElement(id, slideId, parsed.data as SlideElement);
    if (!slide) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(slide, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
