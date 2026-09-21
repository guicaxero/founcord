import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

export type AuditInput = Readonly<{
  actorUserId: string | null;
  campaignId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  correlationId: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export function prepareAudit(
  db: D1Database,
  input: AuditInput,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (
        id, actor_user_id, campaign_id, action, entity_type, entity_id,
        correlation_id, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.actorUserId,
      input.campaignId,
      input.action,
      input.entityType,
      input.entityId,
      input.correlationId,
      JSON.stringify(input.details ?? {}),
    );
}

export function prepareAuditAfterChange(
  db: D1Database,
  input: AuditInput,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (
        id, actor_user_id, campaign_id, action, entity_type, entity_id,
        correlation_id, details_json
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`,
    )
    .bind(
      crypto.randomUUID(),
      input.actorUserId,
      input.campaignId,
      input.action,
      input.entityType,
      input.entityId,
      input.correlationId,
      JSON.stringify(input.details ?? {}),
    );
}

export function prepareOutboxEvent(
  db: D1Database,
  input: Readonly<{
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
  }>,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO outbox_events (
        id, aggregate_type, aggregate_id, event_type, payload_json, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.aggregateType,
      input.aggregateId,
      input.eventType,
      JSON.stringify(input.payload),
      new Date().toISOString(),
    );
}

export function prepareOutboxEventAfterChange(
  db: D1Database,
  input: Readonly<{
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
  }>,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO outbox_events (
        id, aggregate_type, aggregate_id, event_type, payload_json, occurred_at
      ) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0`,
    )
    .bind(
      crypto.randomUUID(),
      input.aggregateType,
      input.aggregateId,
      input.eventType,
      JSON.stringify(input.payload),
      new Date().toISOString(),
    );
}
