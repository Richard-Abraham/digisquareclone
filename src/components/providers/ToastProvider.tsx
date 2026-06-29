"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme";

export function ToastProvider() {
  const { theme } = useTheme();
  return <Toaster position="top-right" richColors theme={theme === "dark" ? "dark" : "light"} />;
}
