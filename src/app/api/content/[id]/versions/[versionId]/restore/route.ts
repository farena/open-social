import { NextResponse } from "next/server";
import { getContentItem } from "@/lib/content-items";
import { restoreItemSnapshot } from "@/lib/content-item-snapshots";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;

  const item = await getContentItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (item.state === "generating") {
    return NextResponse.json(
      { error: "Cannot restore while generating" },
      { status: 409 }
    );
  }

  const restored = await restoreItemSnapshot(id, versionId);
  if (!restored) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(restored);
}
