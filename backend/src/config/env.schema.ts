import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  READONLY_DATABASE_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  ENABLE_DEMO_LOGIN: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  AUTH_JWT_SECRET: z.string().min(32).default('development-only-change-me-32-characters'),
  AUTH_JWT_KEYS: z.string().optional().refine(value => {
    if (!value) return true;
    try { const entries = Object.entries(JSON.parse(value)); return entries.length > 0 && entries.length <= 10 && entries.every(([key, secret]) => /^[\w-]{1,64}$/.test(key) && typeof secret === 'string' && secret.length >= 32); } catch { return false; }
  }, 'AUTH_JWT_KEYS must be a JSON map of key IDs to strong secrets'),
  AUTH_JWT_ACTIVE_KEY: z.string().default('current'),
  AUTH_JWT_ISSUER: z.string().default('ledger-local'),
  AUTH_JWT_AUDIENCE: z.string().default('ledger-api'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(300),
  ASSISTANT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  ASSISTANT_PER_DAY: z.coerce.number().int().positive().default(100),
  ASSISTANT_GLOBAL_PER_DAY: z.coerce.number().int().positive().default(1000),
  RETENTION_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
}).superRefine((config, context) => {
  if (config.NODE_ENV === 'production' && !config.AUTH_JWT_KEYS && config.AUTH_JWT_SECRET === 'development-only-change-me-32-characters') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['AUTH_JWT_SECRET'], message: 'Production requires an explicit signing secret' });
  }
  if (config.NODE_ENV === 'production') {
    if (!config.DATABASE_URL.includes('sslmode=require')) context.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'Production DATABASE_URL must require TLS' });
    if (!config.READONLY_DATABASE_URL) context.addIssue({ code: z.ZodIssueCode.custom, path: ['READONLY_DATABASE_URL'], message: 'Production requires a separate read-only database URL' });
    if (config.READONLY_DATABASE_URL && !config.READONLY_DATABASE_URL.includes('sslmode=require')) context.addIssue({ code: z.ZodIssueCode.custom, path: ['READONLY_DATABASE_URL'], message: 'Production READONLY_DATABASE_URL must require TLS' });
    if (config.AUTH_JWT_ISSUER === 'ledger-local') context.addIssue({ code: z.ZodIssueCode.custom, path: ['AUTH_JWT_ISSUER'], message: 'Production requires an explicit JWT issuer' });
    if (config.CORS_ORIGINS.split(',').some(origin => !origin || origin === '*' || /localhost|127\.0\.0\.1/.test(origin))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGINS'], message: 'Production CORS origins must be explicit HTTPS origins' });
    if (config.ENABLE_DEMO_LOGIN) context.addIssue({ code: z.ZodIssueCode.custom, path: ['ENABLE_DEMO_LOGIN'], message: 'Demo login must be disabled in production' });
  }
  if (!!config.GEMINI_API_KEY !== !!config.GEMINI_MODEL) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['GEMINI_MODEL'], message: 'GEMINI_API_KEY and GEMINI_MODEL must be provided together' });
  }
  if (config.AUTH_JWT_KEYS) {
    try { if (!Object.hasOwn(JSON.parse(config.AUTH_JWT_KEYS), config.AUTH_JWT_ACTIVE_KEY)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['AUTH_JWT_ACTIVE_KEY'], message: 'Active signing key does not exist' }); } catch { /* Reported by the field validator. */ }
  }
});

export type Environment = z.infer<typeof envSchema>;
