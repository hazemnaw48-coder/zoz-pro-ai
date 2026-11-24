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

async function download(url, kind) {
  if (!url || typeof url !== "string" || !/^https:\/\//i.test(url)) {
    throw new Error(`رابط تنزيل ${kind} غير صالح أو غير متاح.`);
  }
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`تعذر تنزيل ${kind}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 30 * 1024 * 1024) {
    throw new Error(`ملف ${kind} أكبر من الحد الآمن 30MB.`);
  }
  return bytes;
}

async function main() {
  const projectId = arg("--project-id");
  if (!projectId) {
    throw new Error("الاستخدام: npm run export -- --project-id <EXISTING_STITCH_PROJECT_ID>");
  }

  // Explicitly target an existing project. Never create a replacement project.
  const project = stitch.project(projectId);
  const screens = await project.screens();
  if (!screens.length) throw new Error("المشروع المحدد لا يحتوي شاشات.");

  const outputDir = path.resolve("..", ".stitch", "source", safeName(projectId));
  await mkdir(outputDir, { recursive: true });
  const manifest = {
    source: "Google Stitch",
    projectId,
    exportedAt: new Date().toISOString(),
    screens: [],
  };

  for (const screen of screens) {
    const screenId = screen.screenId ?? screen.id;
    if (!screenId) continue;
    const title = screen.title ?? screen.name ?? screenId;
    const slug = safeName(title);
    const prefix = `${slug}-${safeName(screenId)}`;

    const htmlUrl = await screen.getHtml();
    const imageUrl = await screen.getImage();
    const [html, image] = await Promise.all([
      download(htmlUrl, "HTML"),
      download(imageUrl, "screenshot"),
    ]);

    const htmlFile = `${prefix}.html`;
    const imageFile = `${prefix}.png`;
    await writeFile(path.join(outputDir, htmlFile), html);
    await writeFile(path.join(outputDir, imageFile), image);

    manifest.screens.push({
      screenId,
      title,
      deviceType: screen.deviceType ?? null,
      htmlFile,
      screenshotFile: imageFile,
    });
  }

  await writeFile(
    path.join(outputDir, "STITCH-SOURCE-MANIFEST.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  console.log(JSON.stringify({
    projectId,
    exportedScreens: manifest.screens.length,
    outputDir,
    manifest: path.join(outputDir, "STITCH-SOURCE-MANIFEST.json"),
  }, null, 2));
}

main().catch((error) => {
  console.error("تعذر تصدير المشروع من Stitch.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
