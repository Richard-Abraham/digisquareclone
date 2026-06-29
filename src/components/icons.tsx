function base() {
  return { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}

export function TasksIcon() {
  return (
    <svg {...base()} width={18} height={18}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function UserIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg {...base()} width={18} height={18}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

export function BellIcon(props: { size?: number }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18}>
      <path d="M6 9a6 6 0 1 1 12 0c0 3.2 1 5 1.5 6H4.5C5 14 6 12.2 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg {...base()} width={18} height={18}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5" />
      <path d="M15.5 7a2.8 2.8 0 0 1 0 5.6" />
      <path d="M16.5 14.3c2.3.5 4 2.6 4 5.2" />
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg {...base()} width={18} height={18}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8A2 2 0 0 1 21 9.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg {...base()} width={18} height={18}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
    </svg>
  );
}

export function BugIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 14} height={props.size ?? 14} className={props.className}>
      <rect x="7" y="8" width="10" height="11" rx="5" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2M4 12h3M17 12h3M5 17l3-1.5M19 17l-3-1.5M5 8l2.5 2M19 8l-2.5 2" />
    </svg>
  );
}

export function CheckIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 14} height={props.size ?? 14} className={props.className}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function CloseIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 14} height={props.size ?? 14} className={props.className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function PinIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 16} height={props.size ?? 16} className={props.className}>
      <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
      <path d="M12 15v5" />
    </svg>
  );
}

export function EyeIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 16} height={props.size ?? 16} className={props.className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function CheckCircleIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 28} height={props.size ?? 28} className={props.className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

export function EyeOffIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 16} height={props.size ?? 16} className={props.className}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.4 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M6.6 6.6A18.6 18.6 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 3.4-.6" />
    </svg>
  );
}

export function SunIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export function GripIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 14} height={props.size ?? 14} className={props.className}>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </svg>
  );
}

export function SpinnerIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 16} height={props.size ?? 16} className={props.className} strokeWidth={2.5}>
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  );
}

export function MailIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

export function LockIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ArrowRightIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowLeftIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function SparklesIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </svg>
  );
}

export function KanbanIcon(props: { size?: number; className?: string }) {
  return (
    <svg {...base()} width={props.size ?? 18} height={props.size ?? 18} className={props.className}>
      <rect x="3" y="3" width="5" height="16" rx="1.5" />
      <rect x="10" y="3" width="5" height="11" rx="1.5" />
      <rect x="17" y="3" width="4" height="7" rx="1.5" />
    </svg>
  );
}
