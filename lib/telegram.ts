import crypto from "crypto";

type TgUser = {
  id: number;
  first_name?: string;
  username?: string;
};

function hmacSha256Hex(key: Buffer | string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

function hmacSha256Buf(key: Buffer | string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

// Telegram Mini Apps validation (WebAppData):
// secret_key = HMAC_SHA256("WebAppData", bot_token)
// check_hash = HMAC_SHA256(secret_key, data_check_string)
export function verifyTelegramInitData(
  initData: string,
  botToken: string
):
  | { ok: true; user: TgUser; auth_date: string | null }
  | { ok: false; reason: string } {
  if (!initData || typeof initData !== "string") return { ok: false, reason: "EMPTY_INITDATA" };
  if (!botToken) return { ok: false, reason: "EMPTY_BOT_TOKEN" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "BAD_INITDATA_FORMAT" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "NO_HASH" };

  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = hmacSha256Buf("WebAppData", botToken);
  const calcHash = hmacSha256Hex(secretKey, dataCheckString);

  if (calcHash !== hash) {
    return { ok: false, reason: "BAD_HASH" };
  }

  const userStr = params.get("user");
  if (!userStr) return { ok: false, reason: "NO_USER_IN_INITDATA" };

  let userObj: any;
  try {
    userObj = JSON.parse(userStr);
  } catch {
    return { ok: false, reason: "BAD_USER_JSON" };
  }

  const idNum = Number(userObj?.id);
  if (!Number.isFinite(idNum) || idNum <= 0) return { ok: false, reason: "NO_USER_ID" };

  return {
    ok: true,
    user: {
      id: idNum,
      first_name: typeof userObj.first_name === "string" ? userObj.first_name : undefined,
      username: typeof userObj.username === "string" ? userObj.username : undefined,
    },
    auth_date: params.get("auth_date"),
  };
}
