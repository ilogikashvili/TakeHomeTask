import { WsException } from '@nestjs/websockets';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';

interface SocketClient {
	handshake: { auth?: { token?: string }; headers?: { authorization?: string } };
	data: { user?: AuthUser };
	join(room: string): Promise<void>;
	disconnect(close?: boolean): void;
}

interface SocketServer {
	to(room: string): { emit(event: string, payload: unknown): void };
}

@WebSocketGateway()
export class RemindersGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly sessions = new Map<SocketClient, { token: string; expiry: ReturnType<typeof setTimeout>; check: ReturnType<typeof setInterval> }>();
	@WebSocketServer()
	private server?: SocketServer;

	constructor(private readonly auth: AuthService) {}

	async handleConnection(client: SocketClient): Promise<void> {
		try {
			const token = client.handshake.auth?.token ?? this.bearerToken(client.handshake.headers?.authorization);
			if (!token) throw new WsException('Bearer access token required');
			client.data.user = await this.auth.authenticate(token);
			const disconnect = () => { this.handleDisconnect(client); client.disconnect(true); };
			const expiry = setTimeout(disconnect, Math.max(1, this.auth.metadata(token).exp * 1000 - Date.now()));
			const check = setInterval(() => { void this.auth.authenticate(token).catch(disconnect); }, 15000);
			expiry.unref(); check.unref();
			this.sessions.set(client, { token, expiry, check });
		} catch {
			client.disconnect(true);
		}
	}

	handleDisconnect(client: SocketClient): void {
		const session = this.sessions.get(client);
		if (session) { clearTimeout(session.expiry); clearInterval(session.check); this.sessions.delete(client); }
	}

	onModuleDestroy(): void { for (const client of this.sessions.keys()) { this.handleDisconnect(client); client.disconnect(true); } }

	@SubscribeMessage('owner.join')
	async joinOwnerRoom(
		@ConnectedSocket() client: SocketClient,
		@MessageBody() payload: { ownerId?: string },
	): Promise<{ joined: boolean; room: string }> {
		const session = this.sessions.get(client);
		// The first join can arrive while the asynchronous connection check is pending.
		const token = session?.token ?? client.handshake.auth?.token ?? this.bearerToken(client.handshake.headers?.authorization);
		const user = token ? await this.auth.authenticate(token) : undefined;
		if (!user) throw new WsException('Authentication required');
		if (!payload?.ownerId || (user.role === 'owner' && user.ownerId !== payload.ownerId)) {
			throw new WsException('You cannot join this owner room');
		}

		const room = `owner:${payload.ownerId}`;
		await client.join(room);
		return { joined: true, room };
	}

	notifyOwner(ownerId: string, reminderId: string): void {
		this.server?.to(`owner:${ownerId}`).emit('reminder.created', { reminderId });
	}

	notifyDismissed(ownerId: string, notificationId: string): void {
		this.server?.to(`owner:${ownerId}`).emit('reminder.dismissed', { notificationId });
	}

	private bearerToken(authorization?: string): string | undefined {
		return authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
	}
}
