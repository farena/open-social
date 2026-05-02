import { NextResponse } from "next/server";
import { getComponent, updateComponent, deleteComponent } from "@/lib/components";
import { componentPatchSchema } from "@/lib/component-schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const component = await getComponent(id);
  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }
  return NextResponse.json(component);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const result = componentPatchSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 }
      );
    }
    const component = await updateComponent(id, result.data);
    if (!component) {
      return NextResponse.json({ error: "Component not found" }, { status: 404 });
    }
    return NextResponse.json(component);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteComponent(id);
  if (!deleted) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
