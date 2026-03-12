// Type declarations for Supabase Edge Functions (Deno runtime)
// These are only needed for VS Code editor intellisense — they
// don't affect the actual runtime on Supabase.

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    has(key: string): boolean;
    toObject(): Record<string, string>;
  }

  const env: Env;

  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}

// `fetch` is available globally in Deno
declare function fetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response>;

// Deno URL imports — declare the modules so VS Code doesn't complain
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: any): any;
}
