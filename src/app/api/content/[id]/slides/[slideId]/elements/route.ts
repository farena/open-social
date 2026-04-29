import { NextResponse } from "next/server";
import { addSlideElement, getContentItem } from "@/lib/content-items";
import { slideElementSchema } from "@/lib/slide-schema";
import { generateId } from "@/lib/utils";

function isAgentRequest(request: Request): boolean {
  return request.headers.get("x-agent-origin") === "claude";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;

  if (isAgentRequest(request)) {
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
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body && typeof body === "object" && !("id" in body)) {
    (body as { id?: string }).id = generateId();
  }

  const parsed = slideElementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid element payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const result = await addSlideElement(id, slideId, parsed.data);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
