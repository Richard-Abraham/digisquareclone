import { SpinnerIcon } from "@/components/icons";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <SpinnerIcon size={28} className="animate-spin text-primary" />
      <p className="text-sm text-text-secondary mt-3">Loading...</p>
    </div>
  );
}
