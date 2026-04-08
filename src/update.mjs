import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PACKAGE_NAME = "ares-scan";
const PACKAGE_JSON_PATH = fileURLToPath(
  new URL("../package.json", import.meta.url),
);
const UPDATE_CACHE_PATH = join(homedir(), ".ares", "update-check.json");

export function getCurrentVersion() {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function maybeGetUpdateNotice(options = {}) {
  const {
    now = Date.now(),
    env = process.env,
    readCache = readUpdateCache,
    writeCache = writeUpdateCache,
    fetchLatestVersion = fetchLatestPublishedVersion,
    currentVersion = getCurrentVersion(),
  } = options;

  if (env.ARES_NO_UPDATE_CHECK === "1") return null;

  const cache = readCache();
  if (cache?.checkedAt && now - cache.checkedAt < UPDATE_CHECK_INTERVAL_MS) {
    return buildUpdateNotice(currentVersion, cache.latestVersion);
  }

  const latestVersion = fetchLatestVersion();
  if (!latestVersion) return null;

  writeCache({
    checkedAt: now,
    latestVersion,
  });

  return buildUpdateNotice(currentVersion, latestVersion);
}

export function buildUpdateNotice(currentVersion, latestVersion) {
  if (!latestVersion) return null;
  if (compareVersions(latestVersion, currentVersion) <= 0) return null;

  return `Update available: ${currentVersion} -> ${latestVersion}. Run: npm install -g ${PACKAGE_NAME}@latest`;
}

export function compareVersions(left, right) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < length; i++) {
    const leftValue = leftParts[i] || 0;
    const rightValue = rightParts[i] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function normalizeVersion(version) {
  return String(version || "")
    .trim()
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function fetchLatestPublishedVersion() {
  try {
    return execFileSync("npm", ["view", PACKAGE_NAME, "version", "--silent"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2500,
    }).trim();
  } catch {
    return null;
  }
}

function readUpdateCache() {
  try {
    if (!existsSync(UPDATE_CACHE_PATH)) return null;
    return JSON.parse(readFileSync(UPDATE_CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeUpdateCache(payload) {
  try {
    mkdirSync(dirname(UPDATE_CACHE_PATH), { recursive: true });
    writeFileSync(UPDATE_CACHE_PATH, JSON.stringify(payload, null, 2));
  } catch {
    // best-effort cache only
  }
}
