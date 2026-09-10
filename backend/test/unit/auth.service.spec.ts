import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { createHmac } from 'node:crypto';

describe('AuthService', () => {
  const service = new AuthService(new ConfigService({ AUTH_JWT_SECRET: 'test-secret-that-is-at-least-32-chars' }));

  it('round-trips signed owner claims', () => {
    const user = { sub: 'user-1', role: 'owner' as const, ownerId: 'owner-1' };
    expect(service.verify(service.sign(user))).toEqual(user);
  });

  it('rejects tampered tokens', () => {
    const token = service.sign({ sub: 'user-1', role: 'admin' });
    expect(() => service.verify(`${token}tampered`)).toThrow(UnauthorizedException);
  });

  it('rejects expired tokens', () => {
    const token = service.sign({ sub: 'user-1', role: 'admin' }, -1);
    expect(() => service.verify(token)).toThrow(UnauthorizedException);
  });

  it('supports overlapping signing keys and rejects a retired key', () => {
    const keys = { old: 'old-secret-with-at-least-32-characters', next: 'new-secret-with-at-least-32-characters' };
    const make = (ring: object, active: string) => new AuthService(new ConfigService({ AUTH_JWT_KEYS: JSON.stringify(ring), AUTH_JWT_ACTIVE_KEY: active }));
    const oldToken = make(keys, 'old').sign({ sub: 'admin', role: 'admin' });
    expect(make(keys, 'next').verify(oldToken).sub).toBe('admin');
    expect(() => make({ next: keys.next }, 'next').verify(oldToken)).toThrow(UnauthorizedException);
  });

  it.each(['AUTH_JWT_ISSUER', 'AUTH_JWT_AUDIENCE'])('rejects a token intended for another %s', key => {
    const foreign = new AuthService(new ConfigService({ AUTH_JWT_SECRET: 'test-secret-that-is-at-least-32-chars', [key]: 'foreign' }));
    expect(() => service.verify(foreign.sign({ sub: 'admin', role: 'admin' }))).toThrow(UnauthorizedException);
  });

  it.each([
    [{ alg: 'none', typ: 'JWT' }, { sub: 'user', role: 'admin', exp: 9999999999 }],
    [{ alg: 'HS256', typ: 'JWT' }, { sub: 'user', role: 'admin' }],
    [{ alg: 'HS256', typ: 'JWT' }, { sub: 'user', role: 'admin', exp: 'forever' }],
    [{ alg: 'HS256', typ: 'JWT' }, { sub: 'user', role: 'owner', exp: 9999999999 }],
  ])('rejects invalid headers or claims even with a valid signature', (header, claims) => {
    const data = [header, claims].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const signature = createHmac('sha256', 'test-secret-that-is-at-least-32-chars').update(data).digest('base64url');
    expect(() => service.verify(`${data}.${signature}`)).toThrow(UnauthorizedException);
  });
});
