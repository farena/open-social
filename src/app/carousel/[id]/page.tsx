import { redirect } from "next/navigation";

export default async function CarouselRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/content/${id}`);
}
