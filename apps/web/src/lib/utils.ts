import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getApiOrigin(): string {
  const envOrigin =
    (typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_API_ORIGIN || import.meta.env.NEXT_PUBLIC_API_ORIGIN
      : undefined) ||
    (typeof process !== 'undefined' && process.env
      ? process.env.NEXT_PUBLIC_API_ORIGIN
      : undefined);
  return (envOrigin ?? '').replace(/\/$/, '');
}
