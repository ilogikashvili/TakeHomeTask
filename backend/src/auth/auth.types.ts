export type AuthRole = 'owner' | 'admin';

export interface AuthUser {
	sub: string;
	role: AuthRole;
	ownerId?: string;
}