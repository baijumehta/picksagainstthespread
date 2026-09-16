/**
 * The public base URL for links we put in emails.
 *
 * Git-connected Vercel projects give every branch and pull request its own
 * preview URL, so a single hard-coded APP_URL would send anyone signing in from
 * a preview over to production. Vercel sets these variables itself, so they are
 * trustworthy in a way the incoming Host header is not -- building sign-in
 * links from a request header would let someone spoof Host and have the link
 * emailed to a domain they control.
 */
export function appBaseUrl(): string {
  const env = process.env.VERCEL_ENV;

  // Preview and branch deployments: use the URL this deployment is actually on.
  if (env === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Production: prefer an explicit custom domain, else the project's own.
  if (env === "production") {
    if (process.env.APP_URL) return stripSlash(process.env.APP_URL);
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
  }

  return stripSlash(process.env.APP_URL ?? "http://localhost:3000");
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
