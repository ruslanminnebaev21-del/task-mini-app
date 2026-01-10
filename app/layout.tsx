import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
export const metadata = {
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export const metadata: Metadata = {
  title: "TODO",
  description: "Telegram Mini App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
