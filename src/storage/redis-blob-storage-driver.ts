import { BlobStorageDriver, Bytes, DataNamespace, MaybePromise } from "@matter/general";
import { RedisStorage } from "./redis-storage.js";

export class RedisBlobStorageDriver extends BlobStorageDriver {
  static readonly id = "redis";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_namespaceOrPath?: DataNamespace | string) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async create(namespace: DataNamespace, _descriptor?: BlobStorageDriver.Descriptor) {
    const storage = new RedisBlobStorageDriver(namespace);
    try {
      await storage.initialize();
    } catch (error) {
      throw error;
    }
    return storage;
  }

  get initialized(): boolean {
    return RedisStorage.instance.initialized;
  }

  openBlob(contexts: string[], key: string): MaybePromise<Blob> {
    return RedisStorage.instance.openBlob(contexts, key);
  }

  writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): MaybePromise<void> {
    return RedisStorage.instance.writeBlobFromStream(contexts, key, stream);
  }

  initialize(): MaybePromise<void> {
    return RedisStorage.instance.initialize();
  }

  close(): MaybePromise<void> {
    return RedisStorage.instance.close();
  }

  delete(contexts: readonly string[], key: string): MaybePromise<void> {
    return RedisStorage.instance.delete(contexts, key);
  }

  has(contexts: readonly string[], key: string): MaybePromise<boolean> {
    return RedisStorage.instance.has(contexts, key);
  }

  keys(contexts: readonly string[]): MaybePromise<string[]> {
    return RedisStorage.instance.keys(contexts);
  }

  contexts(contexts: readonly string[]): MaybePromise<string[]> {
    return RedisStorage.instance.contexts(contexts);
  }

  clearAll(contexts: readonly string[]): MaybePromise<void> {
    return RedisStorage.instance.clearAll(contexts);
  }
}
