import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientScripts from "./client-scripts";
import { GlobalLoaderProvider } from "@/app/components/GlobalLoader/GlobalLoader";

export const metadata: Metadata = {
  title: "TODO",
  description: "Telegram Mini App",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <ClientScripts />
      </head>
      <body>
        <GlobalLoaderProvider>
          {children}
        </GlobalLoaderProvider>
      </body>
    </html>
  );
}


