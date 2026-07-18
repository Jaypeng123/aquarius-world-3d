import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("defines the Aquarius intro, skip, music, and return flow", async () => {
  const source = await readProjectFile("app/aquarius-game.tsx");

  assert.match(source, /type IntroStep = "landing" \| "story" \| "setup"/);
  assert.match(source, /AQUARIUS_ORIGIN_STORY/);
  assert.match(source, /水瓶座起源/);
  assert.match(source, /intro-audio-control/);
  assert.match(source, /aria-pressed=\{musicEnabled\}/);
  assert.match(source, /story-skip-button/);
  assert.match(source, /story-pager/);
  assert.match(source, /advanceStoryPage/);
  assert.match(source, /circle-back-button/);
  assert.match(source, /returnToSetupFromGame/);
});

test("normalizes avatar previews and removes starter preview assumptions", async () => {
  const [game, css, layout, page, packageJson] = await Promise.all([
    readProjectFile("app/aquarius-game.tsx"),
    readProjectFile("app/globals.css"),
    readProjectFile("app/layout.tsx"),
    readProjectFile("app/page.tsx"),
    readProjectFile("package.json"),
  ]);

  assert.match(game, /mountAvatarPreview/);
  assert.match(game, /normalizedScale/);
  assert.match(game, /createFallbackPreviewAvatar/);
  assert.match(game, /PLAYER_FLOOR_OFFSET = 0\.48/);
  assert.match(game, /PLAYER_START = \{ x: 0, z: 26 \}/);
  assert.match(game, /hasRenderableMesh/);
  assert.match(game, /makePlayerNameLabel/);
  assert.match(game, /avatar-preview-fallback/);
  assert.match(game, /setDefaultCameraView\(runtime, true\)/);
  assert.match(game, /shortcut-help/);
  assert.match(game, /Space 繼續/);
  assert.match(game, /flying-cow/);
  assert.match(game, /signal-jellyfish/);
  assert.match(game, /createSkyWhale/);
  assert.match(game, /addAquariusLandmarks/);
  assert.match(game, /melody = \[/);
  assert.match(css, /\.story-screen/);
  assert.match(css, /\.story-chapter/);
  assert.match(css, /\.story-page-actions/);
  assert.match(css, /\.intro-audio-control/);
  assert.match(css, /\.shortcut-help/);
  assert.match(layout, /title:\s*"Aquarius Archive"/);
  assert.match(page, /<AquariusGame \/>/);

  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
});
