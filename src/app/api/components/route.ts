import { NextResponse } from "next/server";
import { listComponents, createComponent } from "@/lib/components";
import { componentCreateSchema } from "@/lib/component-schema";

export async function GET() {
  const components = await listComponents();
  return NextResponse.json({ components });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = componentCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 }
      );
    }
    const component = await createComponent(result.data);
    return NextResponse.json(component, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
