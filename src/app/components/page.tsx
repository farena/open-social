import { TopBar } from "@/components/layout/TopBar";
import { ComponentsGrid } from "@/components/library/ComponentsGrid";
import { listComponents } from "@/lib/components";

export const metadata = {
  title: "Components — Open Social",
};

export default async function ComponentsPage() {
  const components = await listComponents();

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Components" showBack />
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <ComponentsGrid components={components} />
      </div>
    </div>
  );
}
