import { NextResponse } from "next/server";
import {
  getContentItem,
  removeSlideElement,
  updateSlideElement,
} from "@/lib/content-items";
import { elementPatchSchema } from "@/lib/slide-schema";

function isAgentRequest(request: Request): boolean {
  return request.headers.get("x-agent-origin") === "claude";
}

async function blockIfGenerating(request: Request, id: string) {
  if (!isAgentRequest(request)) return null;
  const item = await getContentItem(id);
  if (item?.state === "generating") {
    return NextResponse.json(
      {
        error:
          "Agent cannot mutate slides during generation — only POST /slides is allowed.",
      },
      { status: 409 }
    );
  }
  return null;
}

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; slideId: string; elementId: string }> }
) {
  const { id, slideId, elementId } = await params;

  const block = await blockIfGenerating(request, id);
  if (block) return block;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = elementPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid element patch", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const result = await updateSlideElement(id, slideId, elementId, parsed.data);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; slideId: string; elementId: string }> }
) {
  const { id, slideId, elementId } = await params;

  const block = await blockIfGenerating(request, id);
  if (block) return block;

  const item = await removeSlideElement(id, slideId, elementId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}
