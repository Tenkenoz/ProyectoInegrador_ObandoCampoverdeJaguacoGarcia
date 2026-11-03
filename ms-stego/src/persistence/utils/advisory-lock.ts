import type { EntityManager } from 'typeorm';

export async function lockAnalysisKey(
  manager: EntityManager,
  id: string,
): Promise<void> {
  await manager.query(
    'SELECT pg_advisory_xact_lock(hashtextextended(($1::uuid)::text, 0))',
    [id],
  );
}

export async function tryLockAnalysisKey(
  manager: EntityManager,
  id: string,
): Promise<boolean> {
  const result: { locked: boolean }[] = await manager.query(
    'SELECT pg_try_advisory_xact_lock(hashtextextended(($1::uuid)::text, 0)) AS locked',
    [id],
  );
  return result[0]?.locked === true;
}

export async function lockQuarantineCapacity(
  manager: EntityManager,
): Promise<void> {
  await manager.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('stego.quarantine.capacity', 0))",
  );
}
