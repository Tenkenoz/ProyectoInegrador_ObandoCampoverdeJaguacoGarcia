export class UnknownSigningKeyError extends Error {
  constructor() {
    super('Unknown token signing key');
    this.name = 'UnknownSigningKeyError';
  }
}
