import clsx from "clsx";

type Variant = "primary" | "success" | "warning" | "danger" | "neutral";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  primary: "badge-primary",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  neutral: "badge-neutral",
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return <span className={clsx(variantClass[variant], className)} {...props} />;
}
