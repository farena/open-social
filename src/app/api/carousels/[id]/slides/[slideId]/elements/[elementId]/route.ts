import { NextResponse } from "next/server";
import { updateSlideElement, deleteSlideElement } from "@/lib/carousels";
import { elementPatchSchema } from "@/lib/slide-schema";
import type { SlideElement } from "@/types/slide-model";

/**
 * PATCH /api/carousels/:id/slides/:slideId/elements/:elementId
 *
 * Partial update of an element. Accepts a deep-partial body keyed by the
 * element's actual kind (text / image / shape). Server merges into the
 * existing element, preserving id and kind.
 */
export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; slideId: string; elementId: string }> },
) {
  const { id, slideId, elementId } = await params;
  try {
    const body = await request.json();
    const parsed = elementPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid element patch", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const slide = await updateSlideElement(
      id,
      slideId,
      elementId,
      parsed.data as Partial<SlideElement>,
    );
    if (!slide) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(slide);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * DELETE /api/carousels/:id/slides/:slideId/elements/:elementId
 */
export async function DELETE(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; slideId: string; elementId: string }> },
) {
  const { id, slideId, elementId } = await params;
  const slide = await deleteSlideElement(id, slideId, elementId);
  if (!slide) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(slide);
}
