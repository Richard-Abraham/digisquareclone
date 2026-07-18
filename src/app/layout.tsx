import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/providers/ToastProvider";

export const metadata: Metadata = {
  title: { default: "Digisystem", template: "%s | Digisystem" },
  description: "The project management workspace built for modern teams. Plan, track, and ship work together.",
  keywords: ["project management", "task tracking", "kanban", "team collaboration", "standups"],
  authors: [{ name: "Digisystem" }],
  icons: { icon: "/icon.png" },
  openGraph: {
    title: "Digisystem",
    description: "The project management workspace built for modern teams.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Digisystem",
    description: "The project management workspace built for modern teams.",
  },
  robots: { index: true, follow: true },
};

const themeScript = `(function(){try{var s=localStorage.getItem('digisystem-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s||(d?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4f46e5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-surface text-text-primary">
        <ThemeProvider>
          <Providers>
            {children}
            <ToastProvider />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
