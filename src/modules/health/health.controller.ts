import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

/**
 * Health endpoints for liveness and readiness probes.
 *
 * /health/live  — process is running (no DB check; used by process supervisors)
 * /health/ready — all critical dependencies reachable (used by load balancers)
 *
 * These endpoints are intentionally excluded from the standard response envelope
 * since orchestration tools expect the raw @nestjs/terminus shape.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly http: HttpHealthIndicator,
  ) {}

  /**
   * Liveness probe — is the process alive?
   * Returns 200 as long as the event loop is responsive.
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return { status: 'ok' };
  }

  /**
   * Readiness probe — can we serve traffic?
   * Checks database connectivity. Add more indicators as dependencies grow.
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe' })
  readiness() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
