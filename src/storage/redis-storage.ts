import ioredis from "ioredis";
import { Storage, StorageError, SupportedStorageTypes, fromJson, toJson } from "@matter/general";

const notInitializedError = new StorageError("Storage not initialized!");

export class RedisStorage implements Storage {
  private redisUrl: string;
  private client: ioredis.Redis | undefined;
  private _initialized = false;

  constructor(private url: string) {
    this.redisUrl = url;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    if (!this._initialized) {
      this.client = new ioredis.Redis(this.url);
      this.client.on("error", (err) => {
        throw new StorageError(`Redis error: ${err}`);
      });
      this._initialized = true;
    }
  }

  close(): void {
    if (this.client) {
      this.client.disconnect();
      this._initialized = false;
    }
  }

  async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
    if (!this.client) throw notInitializedError;
    const hashKey = this.buildRedisHashKey(contexts);
    const value = await this.client.hget(hashKey, key);
    return value !== null ? (fromJson(value) as T) : undefined;
  }

  set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
  set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
  async set(
    contexts: string[],
    keyOrValues: string | Record<string, SupportedStorageTypes>,
    value?: SupportedStorageTypes
  ) {
    if (!this.client) throw notInitializedError;
    const hashKey = this.buildRedisHashKey(contexts);

    if (typeof keyOrValues === "string") {
      await this.client.hset(hashKey, keyOrValues, toJson(value));
    } else {
      const flattened: Record<string, string> = {};
      for (const [field, val] of Object.entries(keyOrValues)) {
        flattened[field] = toJson(val);
      }
      await this.client.hset(hashKey, flattened);
    }
  }

  async delete(contexts: string[], key: string): Promise<void> {
    if (!this.client) throw notInitializedError;
    const hashKey = this.buildRedisHashKey(contexts);
    await this.client.hdel(hashKey, key);
  }

  async keys(contexts: string[]): Promise<string[]> {
    if (!this.client) throw notInitializedError;
    const hashKey = this.buildRedisHashKey(contexts);
    return await this.client.hkeys(hashKey);
  }

  async values(contexts: string[]): Promise<Record<string, SupportedStorageTypes>> {
    if (!this.client) throw notInitializedError;
    const hashKey = this.buildRedisHashKey(contexts);
    const entries = await this.client.hgetall(hashKey);
    const result: Record<string, SupportedStorageTypes> = {};
    for (const [k, v] of Object.entries(entries)) {
      result[k] = fromJson(v);
    }
    return result;
  }

  async contexts(contexts: string[]): Promise<string[]> {
    if (!this.client) throw notInitializedError;
    const prefix = this.buildRedisPrefix(contexts);
    const keys = await this.client.keys(prefix + "*");
    const subContexts = new Set<string>();
    keys.forEach((k) => {
      const remainder = k.slice(prefix.length);
      const [sub] = remainder.split(":", 1);
      if (sub) subContexts.add(sub);
    });
    return Array.from(subContexts);
  }

  async clearAll(contexts: string[]): Promise<void> {
    if (!this.client) throw notInitializedError;
    const hashKey = this.buildRedisHashKey(contexts);
    const keys = await this.client.keys(hashKey + "*");
    keys.push(hashKey);
    await this.client.del(keys);
  }

  // Will be needed in matter-js 0.16
  // async has(contexts: string[], key: string): Promise<boolean> {
  //   if (!this.client) throw notInitializedError;
  //   const hashKey = this.buildRedisHashKey(contexts);
  //   const exists = await this.client.hexists(hashKey, key);
  //   return exists == 1;
  // }

  // async openBlob(contexts: string[], key: string): Promise<Blob> {
  //   if (!this.client) throw notInitializedError;
  //   const hashKey = this.buildRedisHashKey(contexts);
  //   const data = await this.client.hgetBuffer(hashKey, key);

  //   if (!data) {
  //     return new Blob();
  //   }

  //   return new Blob([new Uint8Array(data)]);
  // }

  // async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
  //   if (!this.client) throw notInitializedError;
  //   const hashKey = this.buildRedisHashKey(contexts);
  //   const chunks: Uint8Array[] = [];

  //   for await (const chunk of stream as any) {
  //     chunks.push(chunk);
  //   }

  //   const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

  //   await this.client.hset(hashKey, key, buffer);
  // }

  bgSave(): Promise<string> {
    if (!this.client) throw notInitializedError;
    return this.client.bgsave();
  }

  buildRedisHashKey(contexts: string[]): string {
    return contexts.length ? contexts.join(":") : "root";
  }

  buildRedisPrefix(contexts: string[]): string {
    return contexts.length ? contexts.join(":") + ":" : "";
  }
}
