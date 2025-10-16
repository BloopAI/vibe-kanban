import type { Clerk } from '@clerk/types';

declare global {
  interface Window {
    Clerk?: Clerk;
  }
}

export {};
