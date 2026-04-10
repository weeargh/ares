import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUpdateNotice,
  compareVersions,
  maybeGetUpdateNotice,
} from "../src/update.mjs";

test("compareVersions handles standard semver ordering", () => {
  assert.equal(compareVersions("0.1.1", "0.1.0"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.2.0", "1.10.0"), -1);
});

test("buildUpdateNotice only returns a message for newer versions", () => {
  assert.match(
    buildUpdateNotice("0.1.0", "0.2.0"),
    /npm install -g ares-scan@latest/,
  );
  assert.match(buildUpdateNotice("0.1.0", "0.2.0"), /ares install-skill/);
  assert.equal(buildUpdateNotice("0.2.0", "0.2.0"), null);
});

test("maybeGetUpdateNotice uses cache and supports opt-out", () => {
  const cache = {
    checkedAt: Date.now(),
    latestVersion: "0.2.0",
  };

  const notice = maybeGetUpdateNotice({
    currentVersion: "0.1.0",
    env: {},
    now: cache.checkedAt,
    readCache: () => cache,
    writeCache: () => {
      throw new Error("should not write cache when it is fresh");
    },
    fetchLatestVersion: () => {
      throw new Error("should not fetch when cache is fresh");
    },
  });

  assert.match(notice, /0\.1\.0 -> 0\.2\.0/);
  assert.equal(
    maybeGetUpdateNotice({
      currentVersion: "0.1.0",
      env: { ARES_NO_UPDATE_CHECK: "1" },
      readCache: () => null,
      writeCache: () => {},
      fetchLatestVersion: () => "0.2.0",
    }),
    null,
  );
});
