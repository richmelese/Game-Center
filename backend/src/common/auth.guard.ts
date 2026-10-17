import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthRequest, AuthUser, IS_PUBLIC, ROLES } from './auth.decorators';

/**
 * Global guard: every route requires a valid JWT unless marked @Public().
 * On public routes a valid token is still decoded (optional auth), so catalog
 * pages can show the caller's own access status.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC,
      targets,
    );
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const header = req.headers.authorization;
    if (Array.isArray(header))
      throw new UnauthorizedException('Invalid authorization header');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; role: Role }>(
          token,
        );
        req.user = { id: payload.sub, role: payload.role } satisfies AuthUser;
      } catch {
        if (!isPublic)
          throw new UnauthorizedException(
            'Session expired, please log in again',
          );
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('Please log in');

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles?.length && !roles.includes(req.user.role)) {
      throw new ForbiddenException('You do not have access to this resource');
    }
    return true;
  }
}
