import { z } from "zod";

export const DomainEventEnvelopeSchema = z
  .object({
    id: z.string().uuid(),
    type: z.string().regex(/^[a-z]+(?:\.[a-z]+)+$/),
    version: z.number().int().positive(),
    occurredAt: z.string().datetime({ offset: true }),
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().nullable(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type DomainEventEnvelope = z.infer<
  typeof DomainEventEnvelopeSchema
>;
