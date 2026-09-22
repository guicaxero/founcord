import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ciPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const deploymentPath = new URL(
  "../.github/workflows/deploy-production.yml",
  import.meta.url,
);

const readWorkflow = async (path) =>
  (await readFile(path, "utf8")).replaceAll("\r\n", "\n");

test("pull requests to main execute the repository quality gate", async () => {
  const workflow = await readWorkflow(ciPath);

  assert.match(workflow, /pull_request:\s*\n\s+branches:\s*\n\s+- main/u);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/u);
  assert.match(workflow, /run: bun install --frozen-lockfile/u);
  assert.match(workflow, /run: bun run ci/u);
});

test("production only deploys main after validation and manual dispatch", async () => {
  const workflow = await readWorkflow(deploymentPath);

  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /push:/u);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /needs:\s*\n\s+- quality/u);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/u);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/u);
  assert.match(workflow, /run: bun run smoke:production/u);
});

test("production migration and deployment order preserves providers first", async () => {
  const workflow = await readWorkflow(deploymentPath);
  const orderedCommands = [
    "bun run db:migrate:remote",
    "bun run db:migrate:integration:remote",
    "bun run db:migrate:automation:remote",
    "bun run deploy\n",
    "bun run deploy:integration",
    "bun run deploy:foundry",
    "bun run deploy:automation",
    "bun run smoke:production",
  ];
  let previousIndex = -1;

  for (const command of orderedCommands) {
    const commandIndex = workflow.indexOf(command);
    assert.ok(commandIndex > previousIndex, `${command} must preserve deployment order`);
    previousIndex = commandIndex;
  }
});
