import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

class InMemoryRedis {
  private readonly values = new Map<string, { value: string; expiresAt: number | null }>();

  private read(key: string): string | null {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<string | null> {
    if (args.includes('NX') && this.read(key) !== null) return null;
    const expiryIndex = args.indexOf('EX');
    const ttl = expiryIndex >= 0 ? Number(args[expiryIndex + 1]) : null;
    this.values.set(key, {
      value,
      expiresAt: ttl !== null && Number.isFinite(ttl) ? Date.now() + ttl * 1000 : null,
    });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.read(key);
  }

  async getdel(key: string): Promise<string | null> {
    const value = this.read(key);
    this.values.delete(key);
    return value;
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.read(key) ?? '0') + 1;
    await this.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.values.get(key);
    if (!entry || this.read(key) === null) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<string> {
    this.values.clear();
    return 'OK';
  }

  disconnect(): void {
    this.values.clear();
  }
}

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;
  private readonly memory = new InMemoryRedis();
  private usingMemory = false;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('redis.url'), {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 2,
    });

    const client = this.redis as Redis & {
      getdel(key: string): Promise<string | null>;
    };
    const nativeGetDel = client.getdel.bind(client);
    client.getdel = async (key: string): Promise<string | null> => {
      try {
        return await nativeGetDel(key);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.toLowerCase().includes('unknown command')) {
          throw error;
        }
        const value = await client.get(key);
        if (value !== null) await client.del(key);
        return value;
      }
    };

    this.redis.on('error', (error: Error) => {
      this.logger.error('Redis connection error', error.stack);
    });
  }

  get client(): Redis {
    return (this.usingMemory ? this.memory : this.redis) as unknown as Redis;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      this.usingMemory = true;
      this.redis.disconnect();
      this.logger.warn(
        `Redis unavailable; using in-memory fallback for local development: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.usingMemory) {
      this.memory.disconnect();
      return;
    }

    if (this.redis.status === 'end') {
      return;
    }

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (ttlSeconds === undefined) {
      await this.client.set(key, serialized);
      return;
    }

    await this.client.set(key, serialized, 'EX', ttlSeconds);
  }
}
