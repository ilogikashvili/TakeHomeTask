import { Body, Controller, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsEnum, IsUUID } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './database/prisma.service';
import { AuthService } from './auth/auth.service';
import { AuthUser } from './auth/auth.types';
import { Public } from './auth/auth.decorators';
import { CurrentUser } from './common/decorators/current-user.decorator';

class DemoLoginDto {
  @IsUUID() ownerId!: string;
  @IsEnum({ owner: 'owner', admin: 'admin' }) role!: 'owner' | 'admin';
}

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService, private readonly config: ConfigService) {}
  @Get('auth/me')
  me(@CurrentUser() user: AuthUser) { return user; }

  @Post('auth/logout')
  logout(@Headers('authorization') authorization: string) { return this.auth.revoke(authorization.slice(7)); }

  @Get('owners')
  owners(@CurrentUser() user: AuthUser) {
    return this.prisma.owner.findMany({ where: user.role === 'owner' ? { id: user.ownerId } : {}, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
  @Get('vendors')
  vendors() { return this.prisma.vendor.findMany({ select: { id: true, name: true, category: true }, orderBy: { name: 'asc' } }); }

  @Get('line-items/:id/approvals')
  async approvals(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const item = await this.prisma.lineItem.findFirst({ where: { id, ...(user.role === 'owner' ? { ownerId: user.ownerId } : {}) } });
    if (!item) throw new NotFoundException('Line item not found');
    return this.prisma.approvalEvent.findMany({ where: { lineItemId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { actor: { select: { id: true, name: true } } } });
  }
  @Public()
  @Get('auth/demo/owners')
  demoOwners() {
    this.requireDemo();
    return this.prisma.owner.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
  @Public()
  @Post('auth/demo')
  async demoLogin(@Body() dto: DemoLoginDto) {
    this.requireDemo();
    if (!await this.prisma.owner.findUnique({ where: { id: dto.ownerId } })) throw new NotFoundException('Owner not found');
    const user = { sub: dto.ownerId, ownerId: dto.ownerId, role: dto.role };
    return { token: this.auth.sign(user, 900), user, expiresIn: 900 };
  }
  private requireDemo() {
    if (this.config.get('NODE_ENV') !== 'development' || !this.config.get('ENABLE_DEMO_LOGIN')) throw new NotFoundException();
  }
}
