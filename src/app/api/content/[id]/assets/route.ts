import { NextResponse } from "next/server";
import { addContentItemAsset, getContentItem } from "@/lib/content-items";
import { generateId, now } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getContentItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ assets: item.assets || [] });
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

    const result = await addContentItemAsset(id, asset);
    if (!result) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    return NextResponse.json(asset, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
