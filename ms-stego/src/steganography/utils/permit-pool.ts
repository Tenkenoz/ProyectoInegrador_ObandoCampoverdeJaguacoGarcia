export class PermitPool {
  private active = 0;

  constructor(private readonly limit: number) {}

  tryAcquire(): (() => void) | undefined {
    if (this.active >= this.limit) return undefined;
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
    };
  }
}
