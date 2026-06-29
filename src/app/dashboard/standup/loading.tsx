import { SkeletonCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="h-8 w-56 bg-surface-tertiary rounded-md animate-pulse mb-6" />
      <SkeletonCard />
      <div className="mt-5 h-32 bg-surface-tertiary rounded-2xl animate-pulse" />
    </div>
  );
}
