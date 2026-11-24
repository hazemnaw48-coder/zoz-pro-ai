import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stitch } from "@google/stitch-sdk";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeName(value) {
  return String(value ?? "screen")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "screen";
}

async function save(url, destination) {
  if (!url || !/^https:\/\//i.test(url)) throw new Error("رابط التنزيل غير صالح.");
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`تعذر التنزيل: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 30 * 1024 * 1024) throw new Error("الملف أكبر من 30MB.");
  await writeFile(destination, bytes);
}

async function main() {
  const projectId = arg("--project-id");
  const screenId = arg("--screen-id");
  const prompt = arg("--prompt");
  if (!projectId || !screenId || !prompt) {
    throw new Error(
      "الاستخدام: npm run edit -- --project-id <ID> --screen-id <ID> --prompt \"Describe the targeted edit\"",
    );
  }

  // This intentionally edits a named screen in the existing project.
  // It never creates a project or a replacement screen.
  const project = stitch.project(projectId);
  const original = await project.getScreen(screenId);
  const generation = await original.edit(prompt);
  const updated = generation.first;

  const directory = path.resolve("..", ".stitch", "iterations", safeName(projectId));
  await mkdir(directory, { recursive: true });
  const htmlFile = path.join(directory, `${safeName(screenId)}.html`);
  const imageFile = path.join(directory, `${safeName(screenId)}.png`);
  await Promise.all([
    save(await updated.getHtml(), htmlFile),
    save(await updated.getImage(), imageFile),
  ]);

  console.log(JSON.stringify({
    projectId,
    screenId: updated.screenId ?? updated.id ?? screenId,\n    generationScreenCount: generation.screens.length,
    htmlFile,
    screenshotFile: imageFile,
    note: "راجع اللقطة والـ HTML قبل اعتماد التغييرات في كود التطبيق.",
  }, null, 2));
}

main().catch((error) => {
  console.error("تعذر تعديل الشاشة في Stitch.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
