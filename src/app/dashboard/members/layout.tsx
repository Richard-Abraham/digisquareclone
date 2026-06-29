import type { Metadata } from "next";

export const metadata: Metadata = { title: "Members" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
