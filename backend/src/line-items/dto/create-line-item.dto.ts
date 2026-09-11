import { IsCalendarDate, DecimalInput } from '../../common/validation';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BillingPeriod } from '@prisma/client';

export class CreateLineItemDto {
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(100)
	reference?: string;

	@IsUUID()
	vendorId!: string;

	@IsUUID()
	ownerId!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(200)
	name!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(100)
	category!: string;

	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;

	@IsEnum(BillingPeriod)
	billingPeriod!: BillingPeriod;

	@DecimalInput()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999999999999.99)
	amount!: number;

	@IsCalendarDate()
	startDate!: string;

	@IsCalendarDate()
	endDate!: string;

	@IsOptional()
	@IsCalendarDate()
	renewalDate?: string;

	@IsOptional()
	autoRenew?: boolean;
}
