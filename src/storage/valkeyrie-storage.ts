import { Valkeyrie } from "valkeyrie";
import { Storage, StorageError, SupportedStorageTypes } from "@matter/general";

export class ValkeyrieStorage implements Storage {
  private client!: Valkeyrie;
  private dbPath: string;
  private _initialized = false;

  constructor(private path: string) {
    this.dbPath = path;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    if (!this._initialized) {
      try {
        this.client = await Valkeyrie.open(this.dbPath);
        this._initialized = true;
      } catch (err) {
        throw new StorageError(`Valkeyrie init error: ${err}`);
      }
    }
  }

  async close(): Promise<void> {
    if (this._initialized) {
      await this.client.close();
      this._initialized = false;
    }
  }

  async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
    try {
      const res = await this.client.get<T>([...contexts, key]);
      return res.value ? res.value : undefined;
    } catch (err) {
      throw new StorageError(`Valkeyrie get error: ${err}`);
    }
  }

  async set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
  async set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
  async set(
    contexts: string[],
    keyOrValues: string | Record<string, SupportedStorageTypes>,
    value?: SupportedStorageTypes
  ): Promise<void> {
    if (typeof keyOrValues === "string") {
      await this.client.set([...contexts, keyOrValues], value);
    } else {
      let atomic = this.client.atomic();
      for (const [key, value] of Object.entries(keyOrValues)) {
        atomic.set([...contexts, key], value);
      }
      await atomic.commit();
    }
  }

  async delete(contexts: string[], key: string): Promise<void> {
    await this.client.delete([...contexts, key]);
  }

  async keys(contexts: string[]): Promise<string[]> {
    let keys = await Array.fromAsync(
      this.client.list({ prefix: contexts }) as AsyncIterable<{ key: string }>,
      (entry) => entry.key.toString()
    );
    return keys;
  }

  async values(contexts: string[]): Promise<Record<string, SupportedStorageTypes>> {
    const result: Record<string, SupportedStorageTypes> = {};

    for await (const entry of this.client.list<SupportedStorageTypes>({ prefix: contexts })) {
      result[entry.key.at(-1)!.toString()] = entry.value;
    }

    return result;
  }

  async contexts(contexts: string[]): Promise<string[]> {
    const prefix = contexts.join(",") + ",";
    const keys = await this.keys(contexts);
    const subContexts = new Set<string>();
    keys.forEach((key) => {
      const remainder = key.slice(prefix.length);
      if (remainder.includes(",")) {
        const [sub] = remainder.split(",", 1);
        if (sub) subContexts.add(sub);
      }
    });
    return Array.from(subContexts);
  }

  async clearAll(contexts: string[]): Promise<void> {
    for await (const entry of this.client.list({ prefix: contexts })) {
      await this.client.delete(entry.key);
    }
  }

  // Will be needed in matter-js 0.16
  // async has(contexts: string[], key: string): Promise<boolean> {
  //   let result = await this.client.get([...contexts, key]);
  //   return result.value != null;
  // }

  // async openBlob(contexts: string[], key: string): Promise<Blob> {
  //   const data = await this.client.get<Buffer>([...contexts, key]);

  //   if (data.value == null) {
  //     return new Blob();
  //   }

  //   return new Blob([new Uint8Array(data.value)]);
  // }

  // async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
  //   const chunks: Uint8Array[] = [];

  //   for await (const chunk of stream as any) {
  //     chunks.push(chunk);
  //   }

  //   const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

  //   await this.client.set([...contexts, key], buffer);
  // }
}
