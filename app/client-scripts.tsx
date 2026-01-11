"use client";

import Script from "next/script";

export default function ClientScripts() {
  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="beforeInteractive"
    />
  );
}