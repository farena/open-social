import { NextResponse } from "next/server";
import { getBusinessContext, updateBusinessContext } from "@/lib/business-context";

export async function GET() {
  const ctx = await getBusinessContext();
  return NextResponse.json(ctx);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const updated = await updateBusinessContext(body);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
