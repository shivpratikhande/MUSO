import { z } from 'zod';

export const ServiceStatusSchema = z.enum(['up', 'down']);

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  services: z.object({
    database: ServiceStatusSchema,
    redis: ServiceStatusSchema,
  }),
});
export type Health = z.infer<typeof HealthSchema>;
