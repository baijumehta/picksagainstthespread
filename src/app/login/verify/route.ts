import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const base = request.nextUrl.origin;

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing", base));
  }

  const ok = await consumeLoginToken(token);
  return NextResponse.redirect(new URL(ok ? "/picks" : "/login?error=expired", base));
}
