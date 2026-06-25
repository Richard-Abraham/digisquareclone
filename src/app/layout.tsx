import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = { title: "Digisystem", description: "Task management" };

const themeScript = `(function(){try{var s=localStorage.getItem('digisystem-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s||(d?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-surface text-text-primary">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
