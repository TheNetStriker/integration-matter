export class BackgroundTask {
  private running = false;
  private intervalMs: number;
  private timeout?: NodeJS.Timeout;
  private controller?: AbortController;
  private loopPromise?: Promise<void>;

  constructor(
    intervalMs: number,
    private readonly task: (signal: AbortSignal) => Promise<void>
  ) {
    this.intervalMs = intervalMs;
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.controller = new AbortController();
    this.loopPromise = this.run();
  }

  public async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    // inform current task
    this.controller?.abort();

    // wait for end of loop
    await this.loopPromise;
  }

  public setInterval(intervalMs: number): void {
    this.intervalMs = intervalMs;
  }

  private async run(): Promise<void> {
    while (this.running) {
      this.controller = new AbortController();

      try {
        await this.task(this.controller.signal);
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          console.error(err);
        }
      }

      if (!this.running) {
        break;
      }

      await this.delay(this.intervalMs);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timeout = setTimeout(resolve, ms);
    });
  }
}
