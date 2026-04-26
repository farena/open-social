import { NextResponse } from "next/server";
import { listTemplates, saveAsTemplate } from "@/lib/templates";
import { getContentItem } from "@/lib/content-items";

export async function GET() {
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { contentItemId, name, description } = body as {
      contentItemId?: string;
      name?: string;
      description?: string;
    };

    if (!contentItemId) {
      return NextResponse.json(
        { error: "contentItemId is required" },
        { status: 400 }
      );
    }

    const item = await getContentItem(contentItemId);
    if (!item) {
      return NextResponse.json(
        { error: "Content item not found" },
        { status: 404 }
      );
    }

    const template = await saveAsTemplate(item, name, description);
    return NextResponse.json(template, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
