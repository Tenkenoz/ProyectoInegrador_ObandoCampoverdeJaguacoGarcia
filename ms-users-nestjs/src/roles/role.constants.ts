export const ROLE_ADMIN = 'ADMIN';
export const ROLE_ANALYST = 'ANALYST';
export const ROLE_USER = 'USER';

export const ROLE_NAMES = [ROLE_ADMIN, ROLE_ANALYST, ROLE_USER] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
