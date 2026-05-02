import { NextResponse } from "next/server";
import { z } from "zod";
import { saveFromElement } from "@/lib/components";

const fromElementBodySchema = z.object({
  contentItemId: z.string().min(1),
  slideId: z.string().min(1),
  elementId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = fromElementBodySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 }
      );
    }

    let component;
    try {
      component = await saveFromElement(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not found")) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message.includes("not a container")) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      console.error("[POST /api/components/from-element]", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json(component, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
