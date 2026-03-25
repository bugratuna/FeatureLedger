import { IsOptional, IsString, Length } from 'class-validator';

export class CreateAddonDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
