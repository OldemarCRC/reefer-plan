// Shared string normalization helpers for server action input sanitization

export function toTitleCase(s: string): string {
  return s.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

export const toUpperCode = (s: string): string => s.trim().toUpperCase();
export const toLower = (s: string): string => s.trim().toLowerCase();
