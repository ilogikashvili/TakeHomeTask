import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ReadonlyDbService } from './readonly-db.service';

@Global()
@Module({ providers: [PrismaService, ReadonlyDbService], exports: [PrismaService, ReadonlyDbService] })
export class PrismaModule {}
