import { NextResponse } from "next/server";
import { getTemplate } from "@/lib/templates";
import { createContentItem, appendSlide, updateContentItem } from "@/lib/content-items";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Create new content item from template, then patch aspectRatio
  let item = await createContentItem({
    type: "carousel",
    hook: template.name,
    bodyIdea: "",
    caption: "",
    hashtags: [],
  });
  item = (await updateContentItem(item.id, { aspectRatio: template.aspectRatio })) ?? item;

  // Copy all slides
  for (const slide of template.slides) {
    await appendSlide(item.id, {
      background: slide.background,
      elements: slide.elements,
      legacyHtml: slide.legacyHtml,
      notes: slide.notes,
    });
  }

  return NextResponse.json(item, { status: 201 });
}
