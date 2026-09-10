import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style className merger */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
