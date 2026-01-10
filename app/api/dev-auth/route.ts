import { NextResponse } from "next/server";

export async function POST() {
  const isDev = process.env.NODE_ENV === "development";
  const allowDev = process.env.DEV_AUTH === "1";

  if (!isDev || !allowDev) {
    return NextResponse.json({ ok: false, reason: "DEV_AUTH_DISABLED" }, { status: 403 });
  }

  const uid = process.env.DEV_TG_ID || "123456789";

  const res = NextResponse.json({
    ok: true,
    dev: true,
    user: {
      id: Number(uid),
      first_name: process.env.DEV_TG_NAME || "Dev",
      username: process.env.DEV_TG_USERNAME || "dev",
    },
  });

  res.cookies.set("dev_uid", uid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}