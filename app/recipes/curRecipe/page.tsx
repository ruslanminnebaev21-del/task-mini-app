// app/recipes/curRecipe/page.tsx
import { Suspense } from "react";
import CurRecipeClient from "./CurRecipeClient";

export default function CurRecipePage() {
  return (
    <Suspense fallback={null}>
      <CurRecipeClient />
    </Suspense>
  );
}