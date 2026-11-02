export interface JwtPayload {
  sub: string;
  username: string;
  tokenVersion: number;
  typ: 'access';
}
