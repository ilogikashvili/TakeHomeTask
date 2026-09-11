import { IsCalendarDate, DecimalInput, OptionalField } from '../../common/validation';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BillingPeriod, LineItemStatus } from '@prisma/client';

export class UpdateLineItemDto {
	@OptionalField()
	@IsString()
	@MinLength(1)
	@MaxLength(100)
	reference?: string;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	expectedVersion!: number;

	@OptionalField()
	@IsUUID()
	ownerId?: string;

	@OptionalField()
	@IsString()
	@MinLength(1)
	@MaxLength(200)
	name?: string;

	@OptionalField()
	@IsString()
	@MaxLength(100)
	category?: string;

	@OptionalField()
	@IsString()
	@MaxLength(2000)
	description?: string;

	@OptionalField()
	@IsEnum(BillingPeriod)
	billingPeriod?: BillingPeriod;

	@OptionalField()
	@DecimalInput()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999999999999.99)
	amount?: number;

	@OptionalField()
	@IsCalendarDate()
	startDate?: string;

	@OptionalField()
	@IsCalendarDate()
	endDate?: string;

	@IsOptional()
	@IsCalendarDate()
	renewalDate?: string | null;

	@OptionalField()
	autoRenew?: boolean;

	@OptionalField()
	@IsEnum(LineItemStatus)
	status?: LineItemStatus;

	@IsUUID()
	actorId!: string;
}
