import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
