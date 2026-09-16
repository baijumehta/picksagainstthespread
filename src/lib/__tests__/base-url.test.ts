import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { appBaseUrl } from "../base-url";

const KEYS = ["VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL", "APP_URL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("locally it is just localhost", () => {
  setEnv({});
  assert.equal(appBaseUrl(), "http://localhost:3000");
});

test("a preview deployment links to itself, not to production", () => {
  setEnv({
    VERCEL_ENV: "preview",
    VERCEL_URL: "picks-git-branch-abc.vercel.app",
    APP_URL: "https://picks.example.com",
    VERCEL_PROJECT_PRODUCTION_URL: "picks.vercel.app",
  });
  assert.equal(
    appBaseUrl(),
    "https://picks-git-branch-abc.vercel.app",
    "signing in from a preview must stay on that preview",
  );
});

test("production prefers the custom domain", () => {
  setEnv({
    VERCEL_ENV: "production",
    APP_URL: "https://picks.example.com",
    VERCEL_PROJECT_PRODUCTION_URL: "picks.vercel.app",
    VERCEL_URL: "picks-xyz.vercel.app",
  });
  assert.equal(appBaseUrl(), "https://picks.example.com");
});

test("production falls back to the project URL when no domain is set", () => {
  setEnv({
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "picks.vercel.app",
    VERCEL_URL: "picks-xyz.vercel.app",
  });
  assert.equal(
    appBaseUrl(),
    "https://picks.vercel.app",
    "the stable production URL beats this deployment's one-off URL",
  );
});

test("a trailing slash never doubles up in the link", () => {
  setEnv({ VERCEL_ENV: "production", APP_URL: "https://picks.example.com/" });
  assert.equal(appBaseUrl(), "https://picks.example.com");
});
