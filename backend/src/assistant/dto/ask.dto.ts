import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  question!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsUUID()
  selectedVendorId?: string;
}
