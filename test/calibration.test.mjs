import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { scan } from "../src/scanner.mjs";

function createTempRepo(files) {
  const repoPath = mkdtempSync(join(tmpdir(), "ares-calibration-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return repoPath;
}

test("small JavaScript CLI relies on runnable workflows instead of forcing TypeScript or Docker", () => {
  const repoPath = createTempRepo({
    "package.json": JSON.stringify(
      {
        name: "demo-cli",
        version: "1.0.0",
        bin: { demo: "./bin/demo.mjs" },
        scripts: {
          lint: "echo lint",
          test: "node --test test/*.test.mjs",
          smoke: "node bin/demo.mjs",
          check: "npm test && node bin/demo.mjs",
        },
      },
      null,
      2,
    ),
    "README.md": "# Demo CLI\n\n## Usage\n\nRun it.\n",
    "CLAUDE.md":
      "# CLAUDE.md\n\n## Commands\n\n- npm test\n- npm run smoke\n\n## Patterns\n\nKeep it local-first.\n\n## Anti-Patterns\n\nDo not add hosted dependencies.\n\n## Common Tasks\n\nRun the smoke test.\n",
    "bin/demo.mjs": '#!/usr/bin/env node\nconsole.log("demo");\n',
    "src/index.mjs": "export function main() { return 'demo'; }\n",
    "test/demo.test.mjs":
      'import assert from "node:assert/strict";\nimport test from "node:test";\n\ntest("demo", () => {\n  assert.equal(1, 1);\n});\n',
  });

  try {
    const result = scan(repoPath);
    const tsc = result.categories.find((category) => category.code === "TSC");
    const agt = result.categories.find((category) => category.code === "AGT");
    const env = result.categories.find((category) => category.code === "ENV");
    const testInfra = result.categories.find(
      (category) => category.code === "TEST",
    );
    const cicd = result.categories.find((category) => category.code === "CICD");

    assert.equal(result.repoType, "cli");
    assert.ok(tsc.score > 0);
    assert.equal(
      tsc.recommendations.some((rec) => /TypeScript/.test(rec)),
      false,
    );
    assert.equal(
      tsc.recommendations.some((rec) =>
        /validation.*API boundaries/i.test(rec),
      ),
      false,
    );
    assert.equal(
      agt.recommendations.some((rec) => /\.cursorrules|copilot/i.test(rec)),
      false,
    );
    assert.equal(
      env.recommendations.some((rec) =>
        /docker-compose|devcontainer|Makefile|Justfile/i.test(rec),
      ),
      false,
    );
    assert.ok(testInfra.score >= 5);
    assert.ok(cicd.score >= 2);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("Go repos with Bitbucket Pipelines are recognized without GitHub-centric recommendations", () => {
  const repoPath = createTempRepo({
    "go.mod": "module example.com/demo\n\ngo 1.22\n",
    "bitbucket-pipelines.yml": `pipelines:
  default:
    - step:
        name: validate
        script:
          - golangci-lint run ./...
          - gofmt -w .
          - go test ./...
`,
    ".golangci.yml": `linters:
  enable:
    - govet
    - gofmt
    - gofumpt
    - goimports
`,
    "internal/product/uc_product_method.go": `package product

func RetrieveAccount() error {
  return nil
}
`,
    "internal/product/uc_product_method_test.go": `package product

import "testing"

func TestRetrieveAccount(t *testing.T) {
  if err := RetrieveAccount(); err != nil {
    t.Fatal(err)
  }
}
`,
  });

  try {
    const result = scan(repoPath);
    const cicd = result.categories.find((category) => category.code === "CICD");
    const con = result.categories.find((category) => category.code === "CON");
    const mod = result.categories.find((category) => category.code === "MOD");

    assert.equal(result.summary.testFiles, 1);
    assert.equal(
      cicd.recommendations.some((rec) => /Add CI/i.test(rec)),
      false,
    );
    assert.match(
      cicd.findings.find((finding) => finding.signal === "ci_exists").detail,
      /Bitbucket Pipelines/,
    );
    assert.match(
      con.findings.find((finding) => finding.signal === "linter_config").detail,
      /golangci-lint/,
    );
    assert.match(
      con.findings.find((finding) => finding.signal === "formatter_config")
        .detail,
      /Go formatter|gofmt|gofumpt|goimports/,
    );
    assert.equal(
      con.recommendations.some((rec) =>
        /Prettier|Black|ESLint|Ruff/i.test(rec),
      ),
      false,
    );
    assert.equal(
      mod.recommendations.some((rec) =>
        /colocate tests, types, and constants within each feature directory/i.test(
          rec,
        ),
      ),
      false,
    );
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("Go recommendations mention Go-native tooling when gaps are real", () => {
  const repoPath = createTempRepo({
    "go.mod": "module example.com/demo\n\ngo 1.22\n",
    "bitbucket-pipelines.yml": `pipelines:
  default:
    - step:
        name: test
        script:
          - go test ./...
`,
    "internal/product/service.go": `package product

func Run() {}
`,
  });

  try {
    const result = scan(repoPath);
    const con = result.categories.find((category) => category.code === "CON");

    assert.match(con.recommendations.join("\n"), /golangci-lint|gofmt|gofumpt/);
    assert.doesNotMatch(
      con.recommendations.join("\n"),
      /Prettier|Black|ESLint|Ruff/,
    );
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("Non-Node service guidance stays capability-based across env and test workflows", () => {
  const sourceFiles = Object.fromEntries(
    Array.from({ length: 26 }, (_, index) => [
      `internal/domain/file_${index}.go`,
      `package domain

func Value${index}() int { return ${index} }
`,
    ]),
  );

  const repoPath = createTempRepo({
    "go.mod": "module example.com/service\n\ngo 1.22\n",
    "bitbucket-pipelines.yml": `pipelines:
  default:
    - step:
        name: test
        script:
          - go test ./...
`,
    "api/http.go": `package api

func RegisterRoutes() {}
`,
    "api/http_test.go": `package api

import "testing"

func TestRegisterRoutes(t *testing.T) {}
`,
    ...sourceFiles,
  });

  try {
    const result = scan(repoPath);
    const env = result.categories.find((category) => category.code === "ENV");
    const testInfra = result.categories.find(
      (category) => category.code === "TEST",
    );

    assert.match(
      env.recommendations.join("\n"),
      /Docker Compose|Dev Containers|Nix|bootstrap flow/,
    );
    assert.match(
      env.recommendations.join("\n"),
      /Make|Just|Task|Mage|task runner/,
    );
    assert.match(
      testInfra.recommendations.join("\n"),
      /make check|just check|standard validation entrypoint/i,
    );
    assert.match(
      testInfra.recommendations.join("\n"),
      /go test -cover|coverage artifact/i,
    );
    assert.doesNotMatch(
      testInfra.recommendations.join("\n"),
      /package\.json|npm `check` script/,
    );
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("Go service repos are not defaulted to library and score package colocation correctly", () => {
  const repoPath = createTempRepo({
    "go.mod": "module example.com/scmcore\n\ngo 1.22\n",
    "cmd/main.go": `package main

func main() {}
`,
    "api/http.go": `package api

func Register() {}
`,
    "api/http_test.go": `package api

import "testing"

func TestRegister(t *testing.T) {}
`,
    "internal/usecase/order/uc_order.go": `package order

func Run() {}
`,
    "internal/usecase/order/uc_order_test.go": `package order

import "testing"

func TestRun(t *testing.T) {}
`,
    "internal/repository/order/repository.go": `package order

type Repository interface {
  Save() error
}
`,
    "internal/repository/order/repository_test.go": `package order

import "testing"

func TestRepository(t *testing.T) {}
`,
    "test/mock/order_mock.go": `package mock

type OrderMock struct{}
`,
  });

  try {
    const result = scan(repoPath);
    const nav = result.categories.find((category) => category.code === "NAV");
    const mod = result.categories.find((category) => category.code === "MOD");

    assert.equal(result.repoType, "service");
    assert.match(
      nav.findings.find((finding) => finding.signal === "test_colocation")
        .detail,
      /Go package directories/,
    );
    assert.doesNotMatch(
      nav.findings.find((finding) => finding.signal === "test_colocation")
        .detail,
      /test files are colocated/,
    );
    assert.match(
      mod.findings.find(
        (finding) => finding.signal === "package_self_containment",
      ).detail,
      /Go package directories/,
    );
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("Go TSC accounts for interfaces, validation tags, specs, and explicit wiring", () => {
  const repoPath = createTempRepo({
    "go.mod": "module example.com/contracts\n\ngo 1.22\n",
    "docs/openapi.yaml":
      "openapi: 3.0.0\ninfo:\n  title: Demo\n  version: 1.0.0\n",
    "internal/account/account_dep.go": `package account

type Store interface {
  Save() error
}
`,
    "internal/account/account_init.go": `package account

func NewService() {}
`,
    "internal/account/dto.go": `package account

type CreateRequest struct {
  Name string \`validate:"required"\`
}
`,
  });

  try {
    const result = scan(repoPath);
    const tsc = result.categories.find((category) => category.code === "TSC");

    assert.match(
      tsc.findings.find((finding) => finding.signal === "go_interfaces").detail,
      /Go interface definitions/,
    );
    assert.match(
      tsc.findings.find((finding) => finding.signal === "go_validation_tags")
        .detail,
      /validation-tag usages/,
    );
    assert.match(
      tsc.findings.find((finding) => finding.signal === "go_explicit_wiring")
        .detail,
      /dependency-wiring files/,
    );
    assert.match(
      tsc.findings.find((finding) => finding.signal === "contract_specs")
        .detail,
      /contract\/spec files/,
    );
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
