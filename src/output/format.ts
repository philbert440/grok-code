export const CYAN = '\x1b[36m';
export const YELLOW = '\x1b[33m';
export const RED = '\x1b[31m';
export const GREEN = '\x1b[32m';
export const DIM = '\x1b[2m';
export const RESET = '\x1b[0m';

export function log(s: string): void {
  process.stderr.write(s);
}