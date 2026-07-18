import {
  LayoutGrid, User, Calendar, Bell, Users, Folder, BarChart3, Bug, Check, X,
  Pin, Eye, CheckCircle, EyeOff, Sun, Moon, GripVertical, Loader2, Mail, Lock,
  ArrowRight, ArrowLeft, Sparkles, Columns3, type LucideProps,
} from "lucide-react";

type IconProps = { size?: number; className?: string };

const make = (Icon: React.ComponentType<LucideProps>, defaultSize = 18, strokeWidth = 1.8) =>
  ({ size, className }: IconProps) => <Icon size={size ?? defaultSize} className={className} strokeWidth={strokeWidth} />;

export const TasksIcon = make(LayoutGrid);
export const UserIcon = make(User);
export const CalendarIcon = make(Calendar);
export const BellIcon = make(Bell);
export const UsersIcon = make(Users);
export const FolderIcon = make(Folder);
export const ChartIcon = make(BarChart3);
export const BugIcon = make(Bug, 14);
export const CheckIcon = make(Check, 14);
export const CloseIcon = make(X, 14);
export const PinIcon = make(Pin, 16);
export const EyeIcon = make(Eye, 16);
export const CheckCircleIcon = make(CheckCircle, 28);
export const EyeOffIcon = make(EyeOff, 16);
export const SunIcon = make(Sun);
export const MoonIcon = make(Moon);
export const GripIcon = make(GripVertical, 14);
export const SpinnerIcon = make(Loader2, 16, 2.5);
export const MailIcon = make(Mail);
export const LockIcon = make(Lock);
export const ArrowRightIcon = make(ArrowRight);
export const ArrowLeftIcon = make(ArrowLeft);
export const SparklesIcon = make(Sparkles);
export const KanbanIcon = make(Columns3);
