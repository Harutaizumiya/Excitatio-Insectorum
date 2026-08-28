import { HttpException, HttpStatus } from '@nestjs/common';

export interface BusinessErrorResponse {
  code: string;
  message: string;
}

export class BusinessException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message } satisfies BusinessErrorResponse, status);
  }
}
