import { NextResponse } from "next/server";
import { getContentItem, updateSlideBackground } from "@/lib/content-items";
import { backgroundSchema } from "@/lib/slide-schema";

function isAgentRequest(request: Request): boolean {
  return request.headers.get("x-agent-origin") === "claude";
}

export async function PUT(
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

  const parsed = backgroundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid background payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const item = await updateSlideBackground(id, slideId, parsed.data);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}
