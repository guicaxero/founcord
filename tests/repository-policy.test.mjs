import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ciPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const deploymentPath = new URL(
  "../.github/workflows/deploy-production.yml",
  import.meta.url,
);

test("pull requests to main execute the repository quality gate", async () => {
  const workflow = await readFile(ciPath, "utf8");

  assert.match(workflow, /pull_request:\s*\n\s+branches:\s*\n\s+- main/u);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/u);
  assert.match(workflow, /run: npm ci/u);
  assert.match(workflow, /run: npm run ci/u);
});

test("production only deploys main after validation and manual dispatch", async () => {
  const workflow = await readFile(deploymentPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /push:/u);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /needs:\s*\n\s+- quality/u);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/u);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/u);
  assert.match(workflow, /run: npm run smoke:production/u);
});

test("production migration and deployment order preserves providers first", async () => {
  const workflow = await readFile(deploymentPath, "utf8");
  const orderedCommands = [
    "npm run db:migrate:remote",
    "npm run db:migrate:integration:remote",
    "npm run db:migrate:automation:remote",
    "npm run deploy\n",
    "npm run deploy:integration",
    "npm run deploy:foundry",
    "npm run deploy:automation",
    "npm run smoke:production",
  ];
  let previousIndex = -1;

  for (const command of orderedCommands) {
    const commandIndex = workflow.indexOf(command);
    assert.ok(commandIndex > previousIndex, `${command} must preserve deployment order`);
    previousIndex = commandIndex;
  }
});
