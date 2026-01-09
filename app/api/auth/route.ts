import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTelegramInitData } from "@/lib/telegram";

export async function POST(req: Request) {
  try {
    const { initData } = await req.json();

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ ok: false, reason: "NO_BOT_TOKEN_IN_ENV" }, { status: 500 });
    }

    // Проверяем подпись Telegram
    const ver = verifyTelegramInitData(initData, botToken);

    if (!ver.ok || !ver.user || !ver.user.id) {
      return NextResponse.json(
        { ok: false, reason: "BAD_TELEGRAM_USER", details: ver },
        { status: 401 }
      );
    }

    const tgUser = ver.user;

    // создаём/находим пользователя
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          tg_id: tgUser.id,
          telegram_id: tgUser.id,
          username: tgUser.username || null,
          first_name: tgUser.first_name || null,
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

    const token = jwt.sign(
      { uid: user.id },
      process.env.APP_JWT_SECRET!,
      { expiresIn: "30d" }
    );

    const res = NextResponse.json({ ok: true });

    res.cookies.set("session", token, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
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