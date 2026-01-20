// app/components/PageFade/PageFade.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./PageFade.module.css";

declare global {
  interface Window {
    __pageFadeStartExit?: () => void;
  }
}

export default function PageFade({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setReady(true);

    window.__pageFadeStartExit = () => {
      setLeaving(true);
    };

    return () => {
      // не оставляем мусор
      if (window.__pageFadeStartExit) delete window.__pageFadeStartExit;
    };
  }, []);

  return (
    <div
      className={`${styles.wrap} ${ready ? styles.ready : ""} ${
        leaving ? styles.leaving : ""
      }`}
    >
      {children}
    </div>
  );
}