import { Suspense } from "react";
import NewRecipeClient from "./NewRecipeClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NewRecipeClient />
    </Suspense>
  );
}