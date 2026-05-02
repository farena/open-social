import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ComponentEditor } from "@/components/library/ComponentEditor";
import { getComponent } from "@/lib/components";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const component = await getComponent(id);
  return {
    title: component
      ? `${component.name} — Components`
      : "Component not found",
  };
}

export default async function ComponentEditorPage({ params }: PageProps) {
  const { id } = await params;
  const component = await getComponent(id);

  if (!component) {
    notFound();
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title={`Edit: ${component.name}`} showBack />
      <div className="flex-1 min-h-0 flex">
        <ComponentEditor initial={component} />
      </div>
    </div>
  );
}
