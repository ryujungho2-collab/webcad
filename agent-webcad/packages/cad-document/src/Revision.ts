export class Revision {
  private version: number;
  
  constructor(version: number = 0) {
    this.version = version;
  }

  next() {
    this.version++;
    return this.version;
  }

  get() {
    return this.version;
  }
}