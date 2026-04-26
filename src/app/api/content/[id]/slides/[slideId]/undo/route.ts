import { NextResponse } from "next/server";
import { undoSlide } from "@/lib/content-items";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  const item = await undoSlide(id, slideId);
  if (!item) {
    return NextResponse.json(
      { error: "Not found or no previous versions" },
      { status: 404 }
    );
  }
  return NextResponse.json(item);
}
