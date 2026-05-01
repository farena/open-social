import { NextResponse } from "next/server";
import { getContentItem } from "@/lib/content-items";
import { listItemSnapshots } from "@/lib/content-item-snapshots";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await getContentItem(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const versions = await listItemSnapshots(id);
  return NextResponse.json({ versions });
}
