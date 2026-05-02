import { TopBar } from "@/components/layout/TopBar";
import { ComponentEditor } from "@/components/library/ComponentEditor";

export const metadata = {
  title: "New component — Open Social",
};

export default function NewComponentPage() {
  return (
    <div className="h-full flex flex-col">
      <TopBar title="New component" showBack />
      <div className="flex-1 min-h-0 flex">
        <ComponentEditor />
      </div>
    </div>
  );
}
