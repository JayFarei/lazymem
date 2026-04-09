import type { AuditData } from "./types";

export function fixturePath(): string | null {
  return process.env.LAZYMEM_FIXTURE || null;
}

export async function loadFixture(): Promise<AuditData | null> {
  const path = fixturePath();
  if (!path) return null;
  return Bun.file(path).json<AuditData>();
}
