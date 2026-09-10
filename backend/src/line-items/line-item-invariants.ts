import { BadRequestException } from '@nestjs/common';

export interface LineItemDates {
  amount: number;
  startDate: string | Date;
  endDate: string | Date;
  renewalDate?: string | Date | null;
}

export function validateLineItemInvariants(input: LineItemDates): void {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  const renewalDate = input.renewalDate ? new Date(input.renewalDate) : null;

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new BadRequestException('Amount must be a non-negative number');
  }
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    throw new BadRequestException('End date must be after start date');
  }
  if (renewalDate && (Number.isNaN(renewalDate.getTime()) || renewalDate < startDate)) {
    throw new BadRequestException('Renewal date cannot precede start date');
  }
}
