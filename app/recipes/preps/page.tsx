import { Suspense } from "react";
import PrepsClient from "./PrepsClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PrepsClient />
    </Suspense>
  );
}