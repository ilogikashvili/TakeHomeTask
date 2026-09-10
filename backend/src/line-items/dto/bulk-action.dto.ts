import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';
import { LineItemStatus } from '@prisma/client';

export enum BulkAction { REASSIGN = 'reassign', STATUS = 'status', DELETE = 'delete' }

export class BulkItemDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class BulkActionDto {
  @IsEnum(BulkAction)
  action!: BulkAction;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((item: BulkItemDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => BulkItemDto)
  items!: BulkItemDto[];

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsEnum(LineItemStatus)
  status?: LineItemStatus;

  @IsUUID()
  actorId!: string;
}
