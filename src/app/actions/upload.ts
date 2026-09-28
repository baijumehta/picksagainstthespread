"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  importParsedSheet, parseSheet, type ImportSummary,
} from "@/lib/sheet-import";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = /\.(xlsx|xls)$/i;

export type UploadResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; message: string };

/**
 * Read an uploaded pick sheet.
 *
 * `commit` false parses and reports what would change without writing, so the
 * commissioner sees the line movements before agreeing to them -- the sheet's
 * numbers are the pool's and routinely differ from whatever the odds sync
 * last pulled.
 */
export async function uploadSheetAction(formData: FormData): Promise<UploadResult> {
  await requireAdmin();

  const file = formData.get("sheet");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a spreadsheet first." };
  }
  if (!ALLOWED.test(file.name)) {
    return { ok: false, message: "That needs to be an .xls or .xlsx file." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "That file is larger than 5MB, which is not a pick sheet." };
  }

  const commit = formData.get("commit") === "yes";
  const weekOverride = Number(formData.get("week"));

  let parsed;
  try {
    parsed = parseSheet(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    return {
      ok: false,
      message: `Could not read that sheet: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const weekNumber = Number.isFinite(weekOverride) && weekOverride > 0
    ? weekOverride
    : parsed.weekNumber;
  if (!weekNumber) {
    return { ok: false, message: "Could not tell which week this is. Set it by hand." };
  }
  if (!parsed.games.length) {
    return { ok: false, message: "No games found on that sheet. Is it the right file?" };
  }

  try {
    const summary = await importParsedSheet(parsed, weekNumber, { dryRun: !commit });
    if (commit) {
      revalidatePath("/");
      revalidatePath("/board");
      revalidatePath("/season");
      revalidatePath("/admin");
      revalidatePath(`/admin/week/${weekNumber}`);
    }
    return { ok: true, summary };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "The import failed.",
    };
  }
}
