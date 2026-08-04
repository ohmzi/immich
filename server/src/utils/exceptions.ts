import { ForbiddenException } from '@nestjs/common';

/**
 * Machine-readable error code carried in the response body alongside `message`.
 *
 * `GlobalExceptionFilter` spreads an `HttpException`'s object response and strips only
 * `error` and `statusCode`, so any other field — including `code` — reaches the client.
 */
export enum ApiErrorCode {
  PendingApproval = 'pending_approval',
}

/**
 * Thrown when a self sign-up account presents *valid* credentials but has not been approved
 * by an admin yet. Deliberately distinct from the generic 401 so the web client can show the
 * waiting-for-approval screen instead of "incorrect email or password".
 *
 * Depends only on the account's status, never on whether sign-up is currently enabled —
 * otherwise turning sign-up off would strand existing pending users on a misleading error.
 */
export class PendingApprovalException extends ForbiddenException {
  constructor() {
    super({ message: 'Account pending approval', code: ApiErrorCode.PendingApproval });
  }
}
