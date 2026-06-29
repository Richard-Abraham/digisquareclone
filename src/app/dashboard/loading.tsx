import { SkeletonKanbanColumn } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="h-full p-6 overflow-x-auto">
      <div className="flex gap-5 min-w-max">
        <SkeletonKanbanColumn />
        <SkeletonKanbanColumn />
        <SkeletonKanbanColumn />
      </div>
    </div>
  );
}
