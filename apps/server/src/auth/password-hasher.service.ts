import { createRequire } from 'node:module';
import { HttpStatus, Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { BusinessException } from '../common';

interface Argon2Module {
  hash(plain: string): Promise<string>;
  verify(encoded: string, plain: string): Promise<boolean>;
}

const loadOptionalModule = createRequire(__filename);

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    const argon2 = this.loadArgon2();
    if (argon2) {
      return argon2.hash(password);
    }
    return hash(password, 12);
  }

  async verify(encoded: string, plain: string): Promise<boolean> {
    if (!encoded.startsWith('$argon2')) {
      return compare(plain, encoded);
    }

    const argon2 = this.loadArgon2();
    if (!argon2) {
      throw new BusinessException(
        'ARGON2_RUNTIME_UNAVAILABLE',
        '服务端缺少 Argon2 运行时，无法校验该密码',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return argon2.verify(encoded, plain);
  }

  private loadArgon2(): Argon2Module | null {
    try {
      return loadOptionalModule('argon2') as Argon2Module;
    } catch {
      return null;
    }
  }
}
