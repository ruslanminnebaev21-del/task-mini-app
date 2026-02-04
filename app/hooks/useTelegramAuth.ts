// app/hooks/useTelegramAuth.ts

"use client";

import { useEffect, useState } from "react";

function getTelegramWebApp() {
  // @ts-ignore
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

export function useTelegramAuth() {
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const DEV_LOCAL_AUTH = process.env.NEXT_PUBLIC_DEV_LOCAL_AUTH === "true";

  async function authIfPossible() {
  // ⏳ искусственная задержка для теста лоадера
  await new Promise((r) => setTimeout(r, 0)); // 3 секунды

  const tg = getTelegramWebApp();
  const initData = tg?.initData || "";

    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch {}
    }

    // ===== DEV MODE =====
    if (!initData) {
      if (DEV_LOCAL_AUTH) {
        try {
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ initData: "dev", path: window.location.pathname }),
          });

          const j = await r.json().catch(() => ({} as any));
          if (!r.ok || !j.ok) {
            setHint(`Dev auth не прошёл: ${j.reason || r.status}${j.error ? " | " + j.error : ""}`);
          } else {
            setHint(null);
          }
        } catch (e: any) {
          setHint(`Dev auth запрос упал: ${String(e?.message || e)}`);
        }

        setReady(true);
        return;
      }

      setHint("Открой мини-апп кнопкой в боте, тогда появится сохранение.");
      setReady(true);
      return;
    }

    // ===== PROD MODE =====
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData, path: window.location.pathname }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) {
        setHint(`Auth не прошёл: ${j.reason || r.status}${j.error ? " | " + j.error : ""}`);
      } else {
        setHint(null);
      }
    } catch (e: any) {
      setHint(`Auth запрос упал: ${String(e?.message || e)}`);
    }

    setReady(true);
  }

  useEffect(() => {
    authIfPossible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ready,
    hint,
  };
}