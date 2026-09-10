import { Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuthUser } from './auth.types';
import { PrismaService } from '../database/prisma.service';

interface JwtPayload extends AuthUser { exp: number; iat: number; jti: string; iss: string; aud: string }
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = <T>(value: string): T => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;

@Injectable()
export class AuthService {
  private readonly keys: Record<string, string>;
  private readonly active: string;
  private readonly issuer: string;
  private readonly audience: string;
  constructor(@Inject(ConfigService) config: ConfigService, @Optional() private readonly prisma?: PrismaService) {
    this.active = config.get<string>('AUTH_JWT_ACTIVE_KEY') ?? 'current';
    this.keys = JSON.parse(config.get<string>('AUTH_JWT_KEYS') ?? JSON.stringify({ [this.active]: config.get<string>('AUTH_JWT_SECRET') ?? 'development-only-change-me-32-characters' }));
    this.issuer = config.get<string>('AUTH_JWT_ISSUER') ?? 'ledger-local';
    this.audience = config.get<string>('AUTH_JWT_AUDIENCE') ?? 'ledger-api';
  }
  sign(user: AuthUser, expiresInSeconds = 900): string {
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'HS256', typ: 'JWT', kid: this.active });
    const payload = encode({ ...user, iss: this.issuer, aud: this.audience, jti: randomUUID(), iat: now, exp: now + Math.min(expiresInSeconds, 900) });
    const data = header + '.' + payload;
    return data + '.' + this.signature(data, this.keys[this.active]);
  }
  verify(token: string): AuthUser {
    try {
      if (token.length > 4096) throw new Error();
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error();
      const header = decode<{ alg: string; typ: string; kid: string }>(parts[0]);
      if (header.alg !== 'HS256' || header.typ !== 'JWT' || !Object.hasOwn(this.keys, header.kid)) throw new Error();
      const actual = Buffer.from(parts[2]);
      const expected = Buffer.from(this.signature(parts[0] + '.' + parts[1], this.keys[header.kid]));
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
      const payload = decode<JwtPayload>(parts[1]);
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.sub !== 'string' || !payload.sub || !['owner', 'admin'].includes(payload.role)
        || !Number.isSafeInteger(payload.exp) || payload.exp <= now
        || !Number.isSafeInteger(payload.iat) || payload.iat > now + 30 || payload.exp - payload.iat > 900
        || payload.iss !== this.issuer || payload.aud !== this.audience
        || typeof payload.jti !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.jti)
        || (payload.role === 'owner' && (typeof payload.ownerId !== 'string' || !payload.ownerId))) throw new Error();
      return { sub: payload.sub, role: payload.role, ownerId: payload.ownerId };
    } catch { throw new UnauthorizedException('Invalid or expired access token'); }
  }
  async authenticate(token: string): Promise<AuthUser> {
    const user = this.verify(token);
    if (!this.prisma) throw new ServiceUnavailableException('Session verification is unavailable');
    if (await this.prisma.revokedToken.findUnique({ where: { id: this.metadata(token).jti } })) throw new UnauthorizedException('Session revoked');
    return user;
  }
  metadata(token: string): { jti: string; exp: number } {
    this.verify(token);
    const { jti, exp } = decode<JwtPayload>(token.split('.')[1]);
    return { jti, exp };
  }
  async revoke(token: string) {
    const { jti, exp } = this.metadata(token);
    if (!this.prisma) throw new ServiceUnavailableException('Session verification is unavailable');
    await this.prisma.revokedToken.upsert({ where: { id: jti }, update: {}, create: { id: jti, expiresAt: new Date(exp * 1000) } });
    return { revoked: true };
  }
  private signature(input: string, secret: string) { return createHmac('sha256', secret).update(input).digest('base64url'); }
}
