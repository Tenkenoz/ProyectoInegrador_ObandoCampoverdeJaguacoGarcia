export interface AuthenticatedUser {
  userId: string;
  username: string;
  email: string;
  roles: string[];
}