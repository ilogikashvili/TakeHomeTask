import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ConfigModule } from '../config/config.module';

@Module({
	imports: [ConfigModule],
	providers: [AuthService, AuthGuard],
	exports: [AuthService, AuthGuard],
})
export class AuthModule {}