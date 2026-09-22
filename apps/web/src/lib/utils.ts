import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getApiOrigin(): string {
  return (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');
}
