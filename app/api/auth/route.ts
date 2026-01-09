import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTelegramInitData } from "@/lib/telegram";

export async function POST(req: Request) {
  const { initData } = await req.json();

  const botToken = process.env.TELEGRAM_BOT_TOKEN!;
  const verified = verifyTelegramInitData(initData, botToken);

  if (!verified.ok) {
    return NextResponse.json({ ok: false, reason: verified.reason }, { status: 401 });
  }

  const tg = verified.user;

  // ищем пользователя по telegram_id
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, telegram_id")
    .eq("telegram_id", tg.id)
    .maybeSingle();

  let userId = existing?.id;

  // если нет, создаём
  if (!userId) {
    const { data: created, error } = await supabaseAdmin
      .from("users")
      .insert({
        telegram_id: tg.id,
        first_name: tg.first_name ?? null,
        username: tg.username ?? null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    userId = created.id;
  }

  // делаем свою сессию (JWT)
  const token = jwt.sign(
    { userId, telegramId: tg.id },
    process.env.APP_JWT_SECRET!,
    { expiresIn: "30d" }
  );

  const res = NextResponse.json({ ok: true });

  // кладём сессию в cookie
  res.cookies.set("session", token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
  });
  return res;
}
