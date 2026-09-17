import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentPlayer } from "@/lib/auth";
import { logoutAction } from "./actions/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Picks Against the Spread",
  description: "Weekly NFL picks pool: standings, live scoring and pick entry.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // A missing DATABASE_URL should show setup instructions, not a stack trace.
  let player = null;
  let dbReady = true;
  try {
    player = await getCurrentPlayer();
  } catch {
    dbReady = false;
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Picks Against the Spread
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-foreground">This week</Link>
              <Link href="/season" className="hover:text-foreground">Season</Link>
              <Link href="/board" className="hover:text-foreground">Pick board</Link>
              {player ? (
                <Link href="/picks" className="hover:text-foreground">My picks</Link>
              ) : null}
              {player?.isAdmin ? (
                <Link href="/admin" className="hover:text-foreground">Admin</Link>
              ) : null}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {player ? (
                <>
                  <Link href="/account" className="text-muted hover:text-foreground">
                    Signed in as <strong className="text-foreground">{player.initials}</strong>
                  </Link>
                  <form action={logoutAction}>
                    <button type="submit" className="text-muted underline-offset-2 hover:text-foreground hover:underline">
                      Sign out
                    </button>
                  </form>
                </>
              ) : dbReady ? (
                <Link
                  href="/login"
                  className="rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-surface-2"
                >
                  Sign in
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

        <footer className="border-t border-line px-4 py-5 text-center text-xs text-muted">
          Players are shown by initials only.
        </footer>
      </body>
    </html>
  );
}
