import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSession } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const { userId } = await requireSession();
    const url = new URL(req.url);
    const view = url.searchParams.get("view"); // today | all

    let q = supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (view === "today") {
      const today = new Date().toISOString().slice(0, 10);
      q = q.eq("due_date", today);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, tasks: data });
  } catch {
    return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();
    const { title, due_date } = await req.json();

    const { data, error } = await supabaseAdmin
      .from("tasks")
      .insert({ user_id: userId, title, due_date: due_date ?? null })
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, task: data });
  } catch {
    return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await requireSession();
    const { id, done } = await req.json();

    const patch: any = { done: !!done };
    patch.completed_at = done ? new Date().toISOString() : null;

    const { data, error } = await supabaseAdmin
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, task: data });
  } catch {
    return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });
  }
}
