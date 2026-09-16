import { NextResponse, type NextRequest } from "next/server";
import { secretMatches } from "@/lib/auth";
import { refreshAllOpenWeeks } from "@/lib/sync";

export const dynamic = "force-dynamic";

/**
 * Poll ESPN for scores. Point a scheduler at this every minute or two while
 * games are on. Vercel Cron sends the secret as a Bearer token; a plain
 * ?secret= query also works for other schedulers.
 */
export async function GET(request: NextRequest) {
  const header = request.headers.get("authorization");
  const provided =
    header?.startsWith("Bearer ") ? header.slice(7) : request.nextUrl.searchParams.get("secret");

  if (!secretMatches(provided, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshAllOpenWeeks();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}
