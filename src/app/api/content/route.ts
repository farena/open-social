import { NextResponse } from "next/server";
import { listContentItems, createContentItem } from "@/lib/content-items";
import { newContentItemInputSchema } from "@/lib/content-item-schema";

export async function GET() {
  const contentItems = await listContentItems();
  return NextResponse.json({ contentItems });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = newContentItemInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }
    const item = await createContentItem(parsed.data);
    return NextResponse.json(item, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
