export type AuthMethod = 'passkey' | 'password' | 'google' | 'apple';

export function getEnabledAuthMethods(): Set<AuthMethod> {
  const env = process.env.AUTH_METHODS || process.env.NEXT_PUBLIC_AUTH_METHODS;
  if (!env) {
    return new Set(['passkey', 'password', 'google', 'apple']);
  }
  return new Set(env.split(',').map(m => m.trim()) as AuthMethod[]);
}

export function isAuthMethodEnabled(method: AuthMethod): boolean {
  return getEnabledAuthMethods().has(method);
}
