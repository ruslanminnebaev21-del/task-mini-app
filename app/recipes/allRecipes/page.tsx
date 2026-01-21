

// app/recipes/allRecipes/page.tsx

import { Suspense } from "react";
import AllRecipesClient from "./AllRecipesClient";

export default function AllRecipesPage() {
  return (
    <Suspense fallback={null}>
      <AllRecipesClient />
    </Suspense>
  );
}

