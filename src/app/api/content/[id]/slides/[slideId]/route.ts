import { NextResponse } from "next/server";
import { updateSlide, deleteSlide } from "@/lib/content-items";
import { slideUpdateSchema } from "@/lib/slide-schema";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  try {
    const body = await request.json();

    // Transitional: legacy { html } payloads stuff content into legacyHtml.
    if (
      body &&
      typeof body === "object" &&
      typeof body.html === "string" &&
      body.background === undefined &&
      body.elements === undefined
    ) {
      const item = await updateSlide(id, slideId, {
        legacyHtml: body.html,
        elements: [],
      });
      if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(item);
    }

    const parsed = slideUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid slide payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const item = await updateSlide(id, slideId, parsed.data);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  const item = await deleteSlide(id, slideId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}
