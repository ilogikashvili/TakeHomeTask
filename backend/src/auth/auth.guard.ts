import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './auth.decorators';

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;

		const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: unknown }>();
		const authorization = request.headers.authorization;
		if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer access token required');
		request.user = await this.auth.authenticate(authorization.slice('Bearer '.length));
		return true;
	}
}
