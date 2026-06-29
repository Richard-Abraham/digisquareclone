import { SkeletonList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="h-8 w-48 bg-surface-tertiary rounded-md animate-pulse mb-6" />
      <SkeletonList count={4} />
    </div>
  );
}
