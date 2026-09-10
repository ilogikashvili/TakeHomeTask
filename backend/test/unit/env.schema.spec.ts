import { envSchema } from '../../src/config/env.schema';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:password@db:5432/ledger?sslmode=require',
  READONLY_DATABASE_URL: 'postgresql://readonly:password@db:5432/ledger?sslmode=require',
  AUTH_JWT_KEYS: JSON.stringify({ current: 'production-signing-secret-that-is-long-enough-123' }),
  AUTH_JWT_ACTIVE_KEY: 'current',
  AUTH_JWT_ISSUER: 'https://identity.example.com',
  CORS_ORIGINS: 'https://ledger.example.com',
  ENABLE_DEMO_LOGIN: 'false',
};

describe('environment schema', () => {
  it('accepts an explicit production configuration', () => {
    expect(() => envSchema.parse(base)).not.toThrow();
  });

  it('rejects production defaults that weaken isolation or identity', () => {
    expect(() => envSchema.parse({ ...base, READONLY_DATABASE_URL: undefined })).toThrow(/read-only database URL/);
    expect(() => envSchema.parse({ ...base, AUTH_JWT_ISSUER: undefined })).toThrow(/explicit JWT issuer/);
    expect(() => envSchema.parse({ ...base, CORS_ORIGINS: '*' })).toThrow(/CORS origins/);
    expect(() => envSchema.parse({ ...base, ENABLE_DEMO_LOGIN: 'true' })).toThrow(/Demo login/);
  });

  it('requires Gemini credentials as a pair', () => {
    expect(() => envSchema.parse({ ...base, GEMINI_API_KEY: 'key' })).toThrow(/provided together/);
  });
});