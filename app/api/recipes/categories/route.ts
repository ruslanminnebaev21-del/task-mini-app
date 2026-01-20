import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("recipe_categories")
    .select("id, title")
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load categories", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ categories: data ?? [] }, { status: 200 });
}