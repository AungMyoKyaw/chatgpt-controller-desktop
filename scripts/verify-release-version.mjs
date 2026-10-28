#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const cargoManifest = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = [packageJson.version, tauriConfig.version, cargoVersion];
assert(versions.every((v) => /^\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/i.test(v ?? "")), "Missing or invalid SemVer");
assert(versions.every((v) => v === versions[0]), "package.json, tauri.conf.json, and Cargo.toml versions must match");
assert.equal(packageJson.license, "AGPL-3.0-or-later");
assert.match(cargoManifest, /^license\s*=\s*"AGPL-3.0-or-later"/m);
assert(tauriConfig.bundle.active, "Tauri bundling must be enabled");

const tag = process.argv[2] ?? (process.env.GITHUB_REF?.startsWith("refs/tags/") ? process.env.GITHUB_REF.slice("refs/tags/".length) : undefined);
if (tag) assert.equal(tag, `v${versions[0]}`, `Tag ${tag} does not match v${versions[0]}`);
console.log(`Verified version v${versions[0]}${tag ? `, tag ${tag}` : ""} and license AGPL-3.0-or-later`);
