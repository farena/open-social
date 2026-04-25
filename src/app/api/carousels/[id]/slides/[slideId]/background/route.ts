import { NextResponse } from "next/server";
import { updateSlideBackground } from "@/lib/carousels";
import { backgroundSchema } from "@/lib/slide-schema";

/**
 * PUT /api/carousels/:id/slides/:slideId/background
 *
 * Replaces the slide's background. Body: { kind: "solid" | "gradient" | "image", ... }.
 * Granular endpoint exists primarily for the IA — manual editor saves bundle
 * background changes inside the slide PUT.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> },
) {
  const { id, slideId } = await params;
  try {
    const body = await request.json();
    const parsed = backgroundSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid background payload", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const slide = await updateSlideBackground(id, slideId, parsed.data);
    if (!slide) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(slide);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
