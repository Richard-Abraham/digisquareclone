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

export function UserIcon() {
  return (
    <svg {...base()} width={18} height={18}>
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
