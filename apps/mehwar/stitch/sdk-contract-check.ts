import { stitch } from "@google/stitch-sdk";

/**
 * Compile-time contract check against the pinned official Stitch SDK.
 * Does not call the API or create/edit a Stitch project.
 */
async function verifySdkContract() {
  const projects = await stitch.projects();
  if (!projects.length) return;

  const project = stitch.project(projects[0].projectId);
  const screens = await project.screens();
  if (!screens.length) return;

  const original = await project.getScreen(screens[0].screenId);
  const generation = await original.edit("Type-only SDK contract check");
  const updatedScreen = generation.first;
  const htmlUrl: string = await updatedScreen.getHtmlUrl();
  const imageUrl: string = await updatedScreen.getImageUrl();

  void [htmlUrl, imageUrl, generation.screens.length];
}

void verifySdkContract;
