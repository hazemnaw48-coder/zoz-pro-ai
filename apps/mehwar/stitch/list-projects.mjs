import { stitch } from "@google/stitch-sdk";

function field(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function main() {
  const projects = await stitch.projects();
  const rows = [];

  for (const project of projects) {
    let screens = [];
    try {
      screens = await project.screens();
    } catch (error) {
      rows.push({
        projectId: project.projectId ?? project.id,
        title: project.title ?? project.name ?? "(title unavailable)",
        screens: null,
        warning: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    rows.push({
      projectId: project.projectId ?? project.id,
      title: project.title ?? project.name ?? "(title unavailable)",
      screenCount: screens.length,
      screens: screens.map((screen) => ({
        screenId: screen.screenId ?? screen.id,
        title: field(screen.title) ?? field(screen.name) ?? "(untitled screen)",
        deviceType: field(screen.deviceType),
      })),
    });
  }

  // Read-only: this command never creates or edits Stitch projects.
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
}

main().catch((error) => {
  console.error("تعذر قراءة مشاريع Stitch.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
