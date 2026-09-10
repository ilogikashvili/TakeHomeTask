import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/auth/auth.service';
import { RemindersGateway } from '../../src/reminders/reminders.gateway';

function client(token?: string) {
	return {
		handshake: { auth: token ? { token } : undefined, headers: {} },
		data: {} as { user?: { sub: string; role: 'owner' | 'admin'; ownerId?: string } },
		join: jest.fn(async () => undefined),
		disconnect: jest.fn(),
	};
}

describe('RemindersGateway authorization', () => {
	const auth = new AuthService(new ConfigService({ AUTH_JWT_SECRET: 'test-secret-that-is-at-least-32-chars' }));
	const gateway = new RemindersGateway(auth);
	jest.spyOn(auth, 'authenticate').mockImplementation(async token => auth.verify(token));
	afterEach(() => { gateway.onModuleDestroy(); jest.useRealTimers(); });

	it('authenticates an owner during the handshake', async () => {
		const socket = client(auth.sign({ sub: 'user-1', role: 'owner', ownerId: 'owner-1' }));

		await gateway.handleConnection(socket);

		expect(socket.data.user).toEqual({ sub: 'user-1', role: 'owner', ownerId: 'owner-1' });
		expect(socket.disconnect).not.toHaveBeenCalled();
	});

	it('disconnects clients with invalid credentials', async () => {
		const socket = client('invalid-token');

		await gateway.handleConnection(socket);

		expect(socket.disconnect).toHaveBeenCalledWith(true);
	});

	it('allows an owner to join only its own room', async () => {
		const socket = client(auth.sign({ sub: 'user-1', role: 'owner', ownerId: 'owner-1' }));
		await gateway.handleConnection(socket);

		await expect(gateway.joinOwnerRoom(socket, { ownerId: 'owner-2' })).rejects.toThrow('You cannot join this owner room');
		await expect(gateway.joinOwnerRoom(socket, { ownerId: 'owner-1' })).resolves.toEqual({ joined: true, room: 'owner:owner-1' });
	});

	it('allows an admin to join any owner room', async () => {
		const socket = client(auth.sign({ sub: 'admin-1', role: 'admin' }));
		await gateway.handleConnection(socket);

		await expect(gateway.joinOwnerRoom(socket, { ownerId: 'owner-2' })).resolves.toEqual({ joined: true, room: 'owner:owner-2' });
	});
	it('disconnects an already connected socket when its token expires', async () => {
		jest.useFakeTimers();
		const socket = client(auth.sign({ sub: 'user', role: 'admin' }, 1));
		await gateway.handleConnection(socket);
		await jest.advanceTimersByTimeAsync(1001);
		expect(socket.disconnect).toHaveBeenCalledWith(true);
	});
	 it('disconnects an active socket when the next revocation check fails', async () => {
		jest.useFakeTimers();
		const socket = client(auth.sign({ sub: 'user', role: 'admin' }));
		await gateway.handleConnection(socket);
		jest.mocked(auth.authenticate).mockRejectedValueOnce(new Error('Session revoked'));
		await jest.advanceTimersByTimeAsync(15000);
		expect(socket.disconnect).toHaveBeenCalledWith(true);
	});
});
