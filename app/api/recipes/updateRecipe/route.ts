// app/api/recipes/updateRecipe/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TimeParts = { d?: string; h?: string; m?: string };
type KbyuParts = {
  kcal?: number | string | null;
  b?: number | string | null;
  j?: number | string | null;
  u?: number | string | null;
};

function partsToMin(t: TimeParts | null | undefined) {
  const d = Math.max(0, Number((t?.d ?? "").toString().replace(/\D/g, "")) || 0);
  const h = Math.max(0, Number((t?.h ?? "").toString().replace(/\D/g, "")) || 0);
  const m = Math.max(0, Number((t?.m ?? "").toString().replace(/\D/g, "")) || 0);
  return d * 1440 + h * 60 + m;
}

async function getUidFromSession(): Promise<number | null> {
  const c = await cookies();
  const token = c.get("session")?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.APP_JWT_SECRET!) as any;
    const uid = Number(payload?.uid);
    return Number.isFinite(uid) ? uid : null;
  } catch {
    return null;
  }
}

function toNumSafe(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clampNonNeg(n: number | null): number | null {
  if (n === null) return null;
  return n < 0 ? 0 : n;
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const recipeId = Number(body?.recipe_id);
  if (!Number.isFinite(recipeId) || recipeId <= 0) {
    return NextResponse.json({ ok: false, error: "recipe_id_required" }, { status: 400 });
  }

  const title = String(body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  }

  const urlRaw = String(body?.url ?? "").trim();
  const portionsRaw = String(body?.portions ?? "").trim();

  const source_url = urlRaw ? urlRaw : null;
  const portions = portionsRaw ? portionsRaw : null;

  const prep_time_min = partsToMin(body?.prep_time);
  const cook_time_min = partsToMin(body?.cook_time);

  // ===== KBYU =====
  const kbyu: KbyuParts | null = body?.kbyu ?? null;
  const kcal = clampNonNeg(toNumSafe(kbyu?.kcal));
  const b = clampNonNeg(toNumSafe(kbyu?.b));
  const j = clampNonNeg(toNumSafe(kbyu?.j));
  const u = clampNonNeg(toNumSafe(kbyu?.u));

  const category_ids: string[] = Array.isArray(body?.category_ids)
    ? Array.from(new Set(body.category_ids.map((x: any) => String(x)).filter(Boolean)))
    : [];

  const ingredients: string[] = Array.isArray(body?.ingredients)
    ? body.ingredients.map((x: any) => String(x ?? "").trim()).filter(Boolean)
    : [];

  const stepsInput: { text: string }[] = Array.isArray(body?.steps)
    ? body.steps
        .map((s: any) => ({ text: String(s?.text ?? s ?? "").trim() }))
        .filter((s: any) => s.text)
    : [];

  const photoRaw = String(body?.photo_path ?? "").trim();
  const photo_path = photoRaw ? photoRaw : null;

  // 1) проверка владельца
  {
    const { data: owned, error } = await supabaseAdmin
      .from("recipes")
      .select("id")
      .eq("id", recipeId)
      .eq("user_id", uid)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: "db_error_owner_check" }, { status: 500 });
    }
    if (!owned?.id) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  }

  // 2) обновляем основную запись
  {
    const { error } = await supabaseAdmin
      .from("recipes")
      .update({
        title,
        source_url,
        portions,
        prep_time_min,
        cook_time_min,
        photo_path,
        kcal,
        b,
        j,
        u,
      })
      .eq("id", recipeId)
      .eq("user_id", uid);

    if (error) {
      return NextResponse.json({ ok: false, error: "db_error_update_recipe" }, { status: 500 });
    }
  }

  // 3) категории (проще пересобрать связку)
  {
    const del = await supabaseAdmin.from("recipes_to_categories").delete().eq("recipe_id", recipeId);
    if (del.error) {
      return NextResponse.json({ ok: false, error: "db_error_categories_delete" }, { status: 500 });
    }

    if (category_ids.length) {
      const ins = await supabaseAdmin.from("recipes_to_categories").insert(
        category_ids.map((cid) => ({
          recipe_id: recipeId,
          category_id: cid,
        }))
      );
      if (ins.error) {
        return NextResponse.json({ ok: false, error: "db_error_categories_insert" }, { status: 500 });
      }
    }
  }

  // 4) ингредиенты: апдейт по позиции, лишнее удалить, недостающее вставить
  {
    const { data: existing, error } = await supabaseAdmin
      .from("recipe_ingredients")
      .select("id,pos")
      .eq("recipe_id", recipeId)
      .order("pos", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: "db_error_ingredients_load" }, { status: 500 });
    }

    const exist = (existing ?? []) as { id: number; pos: number }[];

    for (let i = 0; i < ingredients.length; i++) {
      const text = ingredients[i];
      const pos = i + 1;
      const row = exist[i];

      if (row?.id) {
        const up = await supabaseAdmin
          .from("recipe_ingredients")
          .update({ text, pos })
          .eq("id", row.id)
          .eq("recipe_id", recipeId);

        if (up.error) {
          return NextResponse.json({ ok: false, error: "db_error_ingredients_update" }, { status: 500 });
        }
      } else {
        const ins = await supabaseAdmin.from("recipe_ingredients").insert({
          recipe_id: recipeId,
          pos,
          text,
        });
        if (ins.error) {
          return NextResponse.json({ ok: false, error: "db_error_ingredients_insert" }, { status: 500 });
        }
      }
    }

    if (exist.length > ingredients.length) {
      const idsToDelete = exist.slice(ingredients.length).map((x) => x.id);
      if (idsToDelete.length) {
        const del = await supabaseAdmin.from("recipe_ingredients").delete().in("id", idsToDelete);
        if (del.error) {
          return NextResponse.json({ ok: false, error: "db_error_ingredients_delete" }, { status: 500 });
        }
      }
    }
  }

  // 5) шаги
  {
    const { data: existing, error } = await supabaseAdmin
      .from("recipe_steps")
      .select("id,pos")
      .eq("recipe_id", recipeId)
      .order("pos", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: "db_error_steps_load" }, { status: 500 });
    }

    const exist = (existing ?? []) as { id: number; pos: number }[];
    const needRebuild = exist.length !== stepsInput.length;

    if (needRebuild) {
      const delAll = await supabaseAdmin.from("recipe_steps").delete().eq("recipe_id", recipeId);
      if (delAll.error) {
        return NextResponse.json({ ok: false, error: "db_error_steps_delete_all" }, { status: 500 });
      }

      if (stepsInput.length) {
        const insAll = await supabaseAdmin.from("recipe_steps").insert(
          stepsInput.map((s, idx) => ({
            recipe_id: recipeId,
            pos: idx + 1,
            text: s.text,
          }))
        );
        if (insAll.error) {
          return NextResponse.json({ ok: false, error: "db_error_steps_insert_all" }, { status: 500 });
        }
      }
    } else {
      for (let i = 0; i < stepsInput.length; i++) {
        const text = stepsInput[i].text;
        const pos = i + 1;
        const row = exist[i];

        if (row?.id) {
          const up = await supabaseAdmin
            .from("recipe_steps")
            .update({ text, pos })
            .eq("id", row.id)
            .eq("recipe_id", recipeId);

          if (up.error) {
            return NextResponse.json({ ok: false, error: "db_error_steps_update" }, { status: 500 });
          }
        } else {
          const ins = await supabaseAdmin.from("recipe_steps").insert({
            recipe_id: recipeId,
            pos,
            text,
          });
          if (ins.error) {
            return NextResponse.json({ ok: false, error: "db_error_steps_insert" }, { status: 500 });
          }
        }
      }

      if (exist.length > stepsInput.length) {
        const idsToDelete = exist.slice(stepsInput.length).map((x) => x.id);
        if (idsToDelete.length) {
          const del = await supabaseAdmin.from("recipe_steps").delete().in("id", idsToDelete);
          if (del.error) {
            return NextResponse.json({ ok: false, error: "db_error_steps_delete" }, { status: 500 });
          }
        }
      }
    }
  }

  // 6) отдаём step_ids (чтобы фронт мог докинуть фото по step_id)
  const { data: stepsRows, error: stepsErr } = await supabaseAdmin
    .from("recipe_steps")
    .select("id,pos")
    .eq("recipe_id", recipeId)
    .order("pos", { ascending: true });

  if (stepsErr) {
    return NextResponse.json({ ok: false, error: "db_error_steps_return" }, { status: 500 });
  }

  const step_ids = (stepsRows ?? []).map((s: any) => ({
    id: Number(s.id),
    pos: Number(s.pos),
  }));

  return NextResponse.json({ ok: true, recipe_id: recipeId, step_ids });
}