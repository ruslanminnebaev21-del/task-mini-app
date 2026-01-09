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

    // Проверяем, что Telegram принимает токен
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    if (!meRes.ok) {
      const txt = await meRes.text();
      return NextResponse.json(
        { ok: false, reason: "BOT_TOKEN_REJECTED_BY_TELEGRAM", details: txt.slice(0, 200) },
        { status: 401 }
      );
    }

    // verifyTelegramInitData возвращает ok + user
    const ver = verifyTelegramInitData(initData, botToken);
    if (!ver.ok) {
      return NextResponse.json({ ok: false, reason: ver.reason }, { status: 401 });
    }

    const tgUser = ver.user;

    // создаём/находим пользователя в нашей базе
    const { data: user, error } = await supabaseAdmin
 	 .from("users")
 	 .upsert(
 	   {
 	     telegram_id: tgUser.id,
 	     username: tgUser.username || null,
 	     first_name: tgUser.first_name || null,
	    },
	    { onConflict: "telegram_id" }
	  )
 	 .select()
	  .single();

    if (error) {
      return NextResponse.json(
    	{ ok: false, reason: "DB_ERROR", error: error.message, details: error },
    	{ status: 500 }
 		 );
    }

    const token = jwt.sign({ uid: user.id }, process.env.APP_JWT_SECRET!, { expiresIn: "30d" });

    const res = NextResponse.json({ ok: true });

    // важно для Telegram webview
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