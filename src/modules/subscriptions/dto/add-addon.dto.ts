import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AddAddonDto {
  @IsUUID()
  addonId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
