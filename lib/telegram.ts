import crypto from "crypto";

export function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false as const, reason: "no_hash" };

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) return { ok: false as const, reason: "bad_hash" };

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false as const, reason: "no_user" };

  const user = JSON.parse(userRaw) as {
    id: number;
    first_name?: string;
    username?: string;
  };

  return { ok: true as const, user, auth_date: params.get("auth_date") };
}
