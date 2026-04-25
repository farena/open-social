import { NextResponse } from "next/server";
import { addCarouselAsset, getCarousel } from "@/lib/carousels";
import { generateId, now } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const carousel = await getCarousel(id);
  if (!carousel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ assets: carousel.assets || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { url, name, description } = body as {
      url?: string;
      name?: string;
      description?: string;
    };

    if (!url || typeof url !== "string" || !url.startsWith("/uploads/")) {
      return NextResponse.json(
        { error: "url must be a /uploads/* path returned by /api/upload" },
        { status: 400 }
      );
    }

    const asset = {
      id: generateId(),
      url,
      name: name?.trim() || "Asset",
      description: description?.trim() || undefined,
      addedAt: now(),
    };

    const result = await addCarouselAsset(id, asset);
    if (!result) {
      return NextResponse.json({ error: "Carousel not found" }, { status: 404 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
