import { StorageDriver, DataNamespace, MaybePromise, SupportedStorageTypes } from "@matter/general";
import { RedisStorage } from "./redis-storage.js";

export class RedisStorageDriver extends StorageDriver {
  static readonly id = "redis";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_namespaceOrPath?: DataNamespace | string) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async create(namespace: DataNamespace, _descriptor?: StorageDriver.Descriptor) {
    const storage = new RedisStorageDriver(namespace);
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

  initialize(): MaybePromise<void> {
    return RedisStorage.instance.initialize();
  }

  close(): MaybePromise<void> {
    return RedisStorage.instance.close();
  }

  get(contexts: string[], key: string): MaybePromise<SupportedStorageTypes | undefined> {
    return RedisStorage.instance.get(contexts, key);
  }

  set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
  set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
  async set(
    contexts: string[],
    keyOrValues: string | Record<string, SupportedStorageTypes>,
    value?: SupportedStorageTypes
  ) {
    if (typeof keyOrValues === "string") {
      return RedisStorage.instance.set(contexts, keyOrValues, value);
    } else {
      return RedisStorage.instance.set(contexts, keyOrValues);
    }
  }

  values(contexts: string[]): MaybePromise<Record<string, SupportedStorageTypes>> {
    return RedisStorage.instance.values(contexts);
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
