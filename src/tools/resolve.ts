import { resolve } from "path";

export function resolvePath(workDir: string, p: string): string {
  return resolve(workDir, p);
}
