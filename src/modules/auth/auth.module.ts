import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenService } from './services/token.service';

/**
 * AuthModule owns JWT configuration, the refresh token entity, and the token
 * pair issuance/verification logic.
 *
 * JwtAuthGuard and TokenService are exported so other modules can consume them
 * without re-importing JwtModule — particularly MembershipsModule (needs TokenService
 * for invitation token hashing) and the future controllers that apply JwtAuthGuard.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expiresIn: (config.get<string>('jwt.accessExpiry') ?? '15m') as any,
        },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard],
  exports: [AuthService, TokenService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
