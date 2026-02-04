// task-mini-app/app/api/auth/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTelegramInitData } from "@/lib/telegram";

export async function POST(req: Request) {
  try {
          // ===== DEV LOCAL AUTH =====
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev && process.env.DEV_LOCAL_AUTH === "true") {
      const fakeTgId = Number(process.env.DEV_TG_ID || 999999);

      const { data: user, error } = await supabaseAdmin
        .from("users")
        .upsert(
          {
            tg_id: fakeTgId,
            telegram_id: fakeTgId,
            username: "local_dev",
            first_name: "Local",
          },
          { onConflict: "tg_id" }
        )
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { ok: false, reason: "DB_ERROR", error: error.message },
          { status: 500 }
        );
      }

      const secret = process.env.APP_JWT_SECRET;
      if (!secret) {
        return NextResponse.json({ ok: false, reason: "NO_APP_JWT_SECRET" }, { status: 500 });
      }

      const token = jwt.sign({ uid: user.id }, secret, { expiresIn: "30d" });

      const res = NextResponse.json({ ok: true, dev: true });

      res.cookies.set("session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
      });

      return res;
    }
    // ===== END DEV LOCAL AUTH =====
    
    const body = await req.json().catch(() => ({} as any));
    const initData = String(body?.initData || "");
    const path = String(body?.path || "");
    

    const ref = req.headers.get("referer") || "";
    const src = path || ref;

    // B = /recipes, A = всё остальное
    const botToken = src.includes("/recipes")
      ? process.env.TELEGRAM_BOT_TOKEN_B
      : process.env.TELEGRAM_BOT_TOKEN_A;

    if (!botToken) {
      return NextResponse.json({ ok: false, reason: "NO_BOT_TOKEN_IN_ENV" }, { status: 500 });
    }

    const ver = verifyTelegramInitData(initData, botToken);
    if (!ver.ok) {
      return NextResponse.json({ ok: false, reason: ver.reason }, { status: 401 });
    }

    const tgId = Number(ver.user?.id);
    if (!Number.isFinite(tgId) || tgId <= 0) {
      return NextResponse.json({ ok: false, reason: "BAD_TG_ID" }, { status: 401 });
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          tg_id: tgId,
          telegram_id: tgId,
          username: ver.user.username || null,
          first_name: ver.user.first_name || null,
        },
        { onConflict: "tg_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, reason: "DB_ERROR", error: error.message },
        { status: 500 }
      );
    }

    const secret = process.env.APP_JWT_SECRET;
    if (!secret) {
      return NextResponse.json({ ok: false, reason: "NO_APP_JWT_SECRET" }, { status: 500 });
    }

    const token = jwt.sign({ uid: user.id }, secret, { expiresIn: "30d" });

    const res = NextResponse.json({ ok: true });
    res.headers.set("x-bot-variant", src.includes("/recipes") ? "B" : "A");

const cookieSecure = process.env.NODE_ENV === "production";

res.cookies.set("session", token, {
  httpOnly: true,
  sameSite: cookieSecure ? "none" : "lax",
  secure: cookieSecure,
  path: "/",
});

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "AUTH_ERROR", error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
