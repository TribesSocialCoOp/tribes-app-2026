export class PublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicError';
  }
}

/**
 * Next.js 14+ aggressively strips error messages thrown from Server Actions
 * in production environments. This higher-order function catches expected
 * user-facing errors (PublicError) and returns them safely to the client.
 */
export function withPublicErrors<T, Args extends any[]>(
  action: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T | { serverError: string }> {
  return async (...args: Args) => {
    try {
      return await action(...args);
    } catch (error: any) {
      if (error instanceof PublicError || error?.name === 'PublicError') {
        return { serverError: error.message };
      }
      
      // Re-throw unexpected errors so Next.js can log them and return a generic digest
      throw error;
    }
  };
}
