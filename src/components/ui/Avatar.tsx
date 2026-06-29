"use client";
import clsx from "clsx";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClass = {
  sm: "avatar-sm size-7 text-[10px]",
  md: "avatar-md size-9 text-sm",
  lg: "avatar-lg size-12 text-base",
};

export function Avatar({ name, size = "md", className, children, ...props }: AvatarProps) {
  return (
    <div className={clsx(sizeClass[size], className)} {...props}>
      {children || name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

export function AvatarGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("avatar-group", className)}>{children}</div>;
}
