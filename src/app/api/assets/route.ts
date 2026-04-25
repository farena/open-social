import { NextResponse } from "next/server";
import { addAsset, listAssets } from "@/lib/assets";

export async function GET() {
  const assets = await listAssets();
  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
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
    const asset = await addAsset({
      url,
      name: name?.trim() || "Asset",
      description,
    });
    return NextResponse.json(asset, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
