import { IsCalendarDate, DecimalInput } from '../../common/validation';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { BillingPeriod } from '@prisma/client';

export class CreateLineItemDto {
	@IsUUID()
	vendorId!: string;

	@IsUUID()
	ownerId!: string;

	@IsString()
	@MinLength(1)
	name!: string;

	@IsString()
	@MinLength(1)
	category!: string;

	@IsString()
	description!: string;

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
}
