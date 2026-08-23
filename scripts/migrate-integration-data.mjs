import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const options = parseOptions(process.argv.slice(2));
const tables = [
  {
    name: "integration_deliveries",
    columns: [
      "id", "destination", "idempotency_key", "external_id", "status",
      "attempts", "last_error", "created_at", "updated_at",
    ],
    select: `SELECT id, destination, idempotency_key, external_id, status,
                    attempts, last_error, created_at, updated_at
             FROM integration_deliveries`,
  },
  {
    name: "integration_inbox_events",
    columns: [
      "id", "source", "external_event_id", "status", "result_entity_id",
      "attempts", "last_error", "created_at", "updated_at",
    ],
    select: `SELECT id, source, external_event_id, status, result_entity_id,
                    attempts, last_error, created_at, updated_at
             FROM integration_inbox_events`,
  },
  {
    name: "discord_post_targets",
    columns: [
      "id", "post_id", "interaction_id", "campaign_id", "discord_user_id",
      "guild_id", "forum_channel_id", "forum_tag_id", "created_at", "updated_at",
    ],
    select: `SELECT t.id, t.post_id, t.interaction_id, t.campaign_id,
                    u.discord_user_id, t.guild_id, t.forum_channel_id,
                    t.forum_tag_id, t.created_at, t.updated_at
             FROM discord_post_targets t
             LEFT JOIN posts p ON p.id = t.post_id
             LEFT JOIN iam_users u ON u.id = p.author_user_id`,
    validate(rows) {
      const missing = rows.filter((row) => !row.discord_user_id);
      if (missing.length > 0) {
        throw new Error(
          `${missing.length} destino(s) não possuem identidade Discord vinculada; a migração foi interrompida.`,
        );
      }
    },
  },
  {
    name: "discord_post_links",
    columns: [
      "id", "post_id", "campaign_id", "guild_id", "forum_channel_id",
      "forum_tag_id", "thread_id", "starter_message_id", "published_at",
      "created_at", "updated_at",
    ],
    select: `SELECT l.id, l.post_id, l.campaign_id, l.guild_id,
                    l.forum_channel_id, t.forum_tag_id, l.thread_id,
                    l.starter_message_id, l.published_at, l.created_at,
                    l.updated_at
             FROM discord_post_links l
             LEFT JOIN discord_post_targets t ON t.post_id = l.post_id`,
  },
];

const snapshots = [];
for (const table of tables) {
  const rows = query(options.source, table.select);
  table.validate?.(rows);
  snapshots.push({ table, rows });
  console.log(`${table.name}: ${rows.length} registro(s) encontrado(s).`);
}

if (!options.apply) {
  console.log("Simulação concluída. Execute novamente com --apply para gravar no destino.");
  process.exit(0);
}

for (const { table, rows } of snapshots) {
  for (const chunk of chunks(rows, 10)) {
    if (chunk.length === 0) continue;
    const values = chunk
      .map((row) => `(${table.columns.map((column) => sqlValue(row[column])).join(", ")})`)
      .join(",\n");
    execute(
      options.target,
      `INSERT OR REPLACE INTO ${table.name} (${table.columns.join(", ")}) VALUES ${values}`,
    );
  }
  const targetCount = query(
    options.target,
    `SELECT COUNT(*) AS count FROM ${table.name}`,
  )[0]?.count;
  if (typeof targetCount !== "number" || targetCount < rows.length) {
    throw new Error(`A validação de ${table.name} falhou no banco de destino.`);
  }
  console.log(`${table.name}: cópia validada no destino (${targetCount} registro(s)).`);
}

console.log("Migração dos dados de integração concluída com sucesso.");

function parseOptions(args) {
  const values = {
    source: "ordem-da-ultima-luz",
    target: "ordem-integration-db",
    apply: false,
  };
  for (const argument of args) {
    if (argument === "--apply") values.apply = true;
    else if (argument.startsWith("--source=")) values.source = argument.slice(9);
    else if (argument.startsWith("--target=")) values.target = argument.slice(9);
    else throw new Error(`Argumento desconhecido: ${argument}`);
  }
  if (!values.source || !values.target || values.source === values.target) {
    throw new Error("Informe bancos de origem e destino diferentes.");
  }
  return values;
}

function query(database, sql) {
  const output = wrangler(database, sql);
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.some((result) => result.success !== true)) {
    throw new Error(`O D1 retornou uma resposta inválida ao consultar ${database}.`);
  }
  return parsed.flatMap((result) => result.results ?? []);
}

function execute(database, sql) {
  wrangler(database, sql);
}

function wrangler(database, sql) {
  const executable = process.execPath;
  const wranglerCli = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(
    executable,
    [wranglerCli, "d1", "execute", database, "--remote", "--command", sql, "--json"],
    { cwd: resolve(root), encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Wrangler encerrou com ${result.status}.`);
  }
  return result.stdout.trim();
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
