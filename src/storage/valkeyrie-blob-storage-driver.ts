import { BlobStorageDriver, Bytes, DataNamespace, MaybePromise } from "@matter/general";
import { ValkeyrieStorage } from "./valkeyrie-storage.js";

export class ValkeyrieBlobStorageDriver extends BlobStorageDriver {
  static readonly id = "valkeyrie";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_namespaceOrPath?: DataNamespace | string) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async create(namespace: DataNamespace, _descriptor?: BlobStorageDriver.Descriptor) {
    const storage = new ValkeyrieBlobStorageDriver(namespace);
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

  openBlob(contexts: string[], key: string): MaybePromise<Blob> {
    return ValkeyrieStorage.instance.openBlob(contexts, key);
  }

  writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): MaybePromise<void> {
    return ValkeyrieStorage.instance.writeBlobFromStream(contexts, key, stream);
  }

  initialize(): MaybePromise<void> {
    return ValkeyrieStorage.instance.initialize();
  }

  close(): MaybePromise<void> {
    return ValkeyrieStorage.instance.close();
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
