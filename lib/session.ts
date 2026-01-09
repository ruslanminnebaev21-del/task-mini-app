import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) throw new Error("NO_SESSION");

  const payload = jwt.verify(token, process.env.APP_JWT_SECRET!) as {
    userId: number;
    telegramId: number;
  };

  return payload;
}
