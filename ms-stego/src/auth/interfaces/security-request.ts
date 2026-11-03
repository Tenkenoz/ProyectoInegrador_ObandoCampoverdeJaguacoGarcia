import type { Request } from 'express';
import type { AuthenticatedSubject } from './authenticated-subject.js';
import type { AuthorizationGrant } from './authorization.js';

export interface SecurityRequest extends Request {
  subject?: AuthenticatedSubject;
  authorizationGrant?: AuthorizationGrant;
}
