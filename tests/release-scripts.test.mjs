import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const tag = `v${version}`;
const run = (script, args = []) =>
  spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root, encoding: "utf8",
  });

test("macOS packager rejects a stale bundle and verifies its resource signature", () => {
  const script = readFileSync(path.join(root, "scripts/package-macos-release.sh"), "utf8");
  assert.match(script, /CFBundleShortVersionString/);
  assert.ok(script.includes('"$actual_version" == "$VERSION"'));
  assert.ok(script.includes("Contents/_CodeSignature/CodeResources"));
});

test("release workflow marks prereleases and rejects the legacy sidecar", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(workflow, /FLAGS\+=\(--prerelease\)/);
  assert.match(workflow, /Unexpected legacy sidecar/);
});

test("release version and license match four manifests", () => {
  const result = run("verify-release-version.mjs", [tag]);
  assert.equal(result.status, 0, result.stderr);
});

test("mismatching tag blocks publication", () => {
  const result = run("verify-release-version.mjs", ["v9.9.9"]);
  assert.notEqual(result.status, 0);
});

test("Homebrew cask generator pins version, URL and checksum", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "chatgpt-controller-tap-"));
  try {
    const sha = "a".repeat(64);
    const result = run("update-homebrew-cask.mjs", [dir, tag, sha]);
    assert.equal(result.status, 0, result.stderr);
    const cask = readFileSync(path.join(dir, "Casks/chatgpt-controller.rb"), "utf8");
    assert.ok(cask.includes(`version "${version}"`));
    assert.match(cask, /sha256 "a{64}"/);
    assert.ok(cask.includes("ChatGPT-Controller-v#{version}-macos-arm64.zip"));
    assert.match(cask, /depends_on arch: :arm64/);
    assert.match(cask, /postflight_steps do/);
    assert.match(cask, /run "\/usr\/bin\/xattr"/);
    assert.ok(cask.includes('["-dr", "com.apple.quarantine", "{{appdir}}/ChatGPT Controller.app"]'));
    assert.match(cask, /must_succeed: false/);
    const syntax = spawnSync("ruby", ["-c", path.join(dir, "Casks/chatgpt-controller.rb")], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Homebrew cask generator rejects invalid checksums and tags", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "chatgpt-controller-tap-"));
  try {
    assert.notEqual(run("update-homebrew-cask.mjs", [dir, "v0.1.0", "bad"]).status, 0);
    assert.notEqual(run("update-homebrew-cask.mjs", [dir, "unexpected", "a".repeat(64)]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
