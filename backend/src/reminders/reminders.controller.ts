import { Controller, Get, Patch, Param, Query, ForbiddenException, BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { RemindersService } from './reminders.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

class OwnerScopeDto {
	@IsOptional()
	@IsUUID()
	ownerId?: string;
}

@Controller('reminders')
export class RemindersController {
	constructor(private readonly service: RemindersService) {}

	@Get('unread')
	unread(@Query() query: OwnerScopeDto, @CurrentUser() user: AuthUser) {
		return this.service.unread(user.role === 'admin' ? this.adminScope(query) : this.requireOwnerId(user));
	}

	@Patch(':notificationId/dismiss')
	dismiss(@Param('notificationId', ParseUUIDPipe) notificationId: string, @Query() query: OwnerScopeDto, @CurrentUser() user: AuthUser) {
		return this.service.dismiss(notificationId, user.role === 'admin' ? this.adminScope(query) : this.requireOwnerId(user));
	}

	private adminScope(query: OwnerScopeDto): string {
		if (!query.ownerId) throw new BadRequestException('ownerId is required for admin reminder requests');
		return query.ownerId;
	}

	private requireOwnerId(user: AuthUser): string {
		if (!user.ownerId) throw new ForbiddenException('Owner identity is missing from access token');
		return user.ownerId;
	}
}
