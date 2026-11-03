export class AuthDependencyError extends Error {
  constructor() {
    super('Authentication service is unavailable');
    this.name = 'AuthDependencyError';
  }
}
