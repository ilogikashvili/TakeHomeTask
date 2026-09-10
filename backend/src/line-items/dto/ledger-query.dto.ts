import { IsCalendarDate, DecimalInput } from '../../common/validation';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export enum LedgerSortField {
	AMOUNT = 'amount',
	VENDOR = 'vendor',
	RENEWAL_DATE = 'renewalDate',
	START_DATE = 'startDate',
	CATEGORY = 'category',
	STATUS = 'status',
}

export enum SortDirection {
	ASC = 'asc',
	DESC = 'desc',
}

export enum LedgerStatus {
	DRAFT = 'DRAFT',
	ACTIVE = 'ACTIVE',
	PENDING_APPROVAL = 'PENDING_APPROVAL',
	TERMINATED = 'TERMINATED',
}

export class LedgerQueryDto {
	@IsOptional()
	@IsUUID()
	vendorId?: string;

	@IsOptional()
	@IsUUID()
	ownerId?: string;

	@IsOptional()
	@IsString()
	category?: string;

	@IsOptional()
	@IsEnum(LedgerStatus)
	status?: LedgerStatus;

	@IsOptional()
	@DecimalInput()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999999999999.99)
	minAmount?: number;

	@IsOptional()
	@DecimalInput()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999999999999.99)
	maxAmount?: number;

	@IsOptional()
	@IsCalendarDate()
	renewalFrom?: string;

	@IsOptional()
	@IsCalendarDate()
	renewalTo?: string;

	@IsOptional()
	@IsString()
	search?: string;

	@IsOptional()
	@IsString()
	cursor?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 25;

	@IsOptional()
	@IsEnum(LedgerSortField)
	sort: LedgerSortField = LedgerSortField.RENEWAL_DATE;

	@IsOptional()
	@IsIn(Object.values(SortDirection))
	direction: SortDirection = SortDirection.ASC;
}
