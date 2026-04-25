import { NextResponse } from "next/server";
import { removeCarouselAsset, updateCarouselAsset } from "@/lib/carousels";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const { id, assetId } = await params;
  try {
    const body = await request.json();
    const { name, description } = body as {
      name?: string;
      description?: string;
    };
    const updated = await updateCarouselAsset(id, assetId, { name, description });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const { id, assetId } = await params;
  const removed = await removeCarouselAsset(id, assetId);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
