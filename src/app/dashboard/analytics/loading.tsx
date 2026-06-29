export default function Loading() {
  return (
    <div className="p-6">
      <div className="h-8 w-40 bg-surface-tertiary rounded-md animate-pulse mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-surface-tertiary rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-80 bg-surface-tertiary rounded-2xl animate-pulse" />
    </div>
  );
}
