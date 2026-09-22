import Redis from 'ioredis';

export class InMemoryRedis {
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

export class RedisService {
  private redis: Redis | null = null;
  private readonly memory = new InMemoryRedis();
  private usingMemory = false;
  private unavailableError: Error | null = null;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          lazyConnect: true,
          enableReadyCheck: true,
          maxRetriesPerRequest: 2,
        });

        const client = this.redis as Redis & {
          getdel(key: string): Promise<string | null>;
        };
        const nativeGetDel = client.getdel?.bind(client);
        if (nativeGetDel) {
          client.getdel = async (key: string): Promise<string | null> => {
            try {
              return await nativeGetDel(key);
            } catch (error) {
              if (
                !(error instanceof Error) ||
                !error.message.toLowerCase().includes('unknown command')
              ) {
                throw error;
              }
              const value = await client.get(key);
              if (value !== null) await client.del(key);
              return value;
            }
          };
        }

        this.redis.on('error', (error: Error) => {
          if (process.env.NODE_ENV === 'production') {
            this.unavailableError = new Error(`Redis unavailable: ${error.message}`);
            console.error(this.unavailableError.message);
          } else {
            console.warn('Redis error, switching to in-memory fallback:', error.message);
            this.usingMemory = true;
          }
        });

        this.redis.connect().catch((error) => {
          if (process.env.NODE_ENV === 'production') {
            this.unavailableError = new Error(
              `Redis unavailable: ${error instanceof Error ? error.message : String(error)}`,
            );
            console.error(this.unavailableError.message);
          } else {
            this.usingMemory = true;
          }
          this.redis?.disconnect();
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `Redis unavailable; using in-memory fallback: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        });
      } catch {
        this.usingMemory = true;
      }
    } else {
      this.usingMemory = true;
    }
  }

  get client(): Redis | InMemoryRedis {
    if (this.unavailableError) throw this.unavailableError;
    return this.usingMemory || !this.redis ? this.memory : this.redis;
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

export const redisService = new RedisService();
