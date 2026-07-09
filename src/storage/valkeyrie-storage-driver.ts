import { StorageDriver, DataNamespace, MaybePromise, SupportedStorageTypes } from "@matter/general";
import { ValkeyrieStorage } from "./valkeyrie-storage.js";

export class ValkeyrieStorageDriver extends StorageDriver {
  static readonly id = "valkeyrie";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_namespaceOrPath?: DataNamespace | string) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async create(namespace: DataNamespace, _descriptor?: StorageDriver.Descriptor) {
    const storage = new ValkeyrieStorageDriver(namespace);
    try {
      await storage.initialize();
    } catch (error) {
      throw error;
    }
    return storage;
  }

  get initialized(): boolean {
    return ValkeyrieStorage.instance.initialized;
  }

  initialize(): MaybePromise<void> {
    return ValkeyrieStorage.instance.initialize();
  }

  close(): MaybePromise<void> {
    return ValkeyrieStorage.instance.close();
  }

  get(contexts: string[], key: string): MaybePromise<SupportedStorageTypes | undefined> {
    return ValkeyrieStorage.instance.get(contexts, key);
  }

  set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
  set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
  async set(
    contexts: string[],
    keyOrValues: string | Record<string, SupportedStorageTypes>,
    value?: SupportedStorageTypes
  ) {
    if (typeof keyOrValues === "string") {
      return ValkeyrieStorage.instance.set(contexts, keyOrValues, value);
    } else {
      return ValkeyrieStorage.instance.set(contexts, keyOrValues);
    }
  }

  values(contexts: string[]): MaybePromise<Record<string, SupportedStorageTypes>> {
    return ValkeyrieStorage.instance.values(contexts);
  }

  delete(contexts: readonly string[], key: string): MaybePromise<void> {
    return ValkeyrieStorage.instance.delete(contexts, key);
  }

  has(contexts: readonly string[], key: string): MaybePromise<boolean> {
    return ValkeyrieStorage.instance.has(contexts, key);
  }

  keys(contexts: string[]): MaybePromise<string[]> {
    return ValkeyrieStorage.instance.keys(contexts);
  }

  contexts(contexts: string[]): MaybePromise<string[]> {
    return ValkeyrieStorage.instance.contexts(contexts);
  }

  clearAll(contexts: string[]): MaybePromise<void> {
    return ValkeyrieStorage.instance.clearAll(contexts);
  }
}
