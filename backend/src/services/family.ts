import { one, pool, query } from '../db.js';
import { conflict, notFound } from '../errors.js';

/**
 * Family profiles: an account can make requests for a child, a parent or someone else it looks after. Only a first name
 * and the relation are kept (no last name, no birth date, no address). The pharmacy sees "Léa (child), request by Alice M.";
 * nobody else sees these people at all.
 */
export const MAX_FAMILY = 6;
export const RELATIONS = ['child', 'parent', 'partner', 'other'] as const;
export type Relation = (typeof RELATIONS)[number];

/** SQL for the "who is it for" label of a request (alias r = requests). */
export const FOR_MEMBER_SQL = `(SELECT json_build_object('firstName', fm.first_name, 'relation', fm.relation) FROM family_members fm WHERE fm.id = r.for_member_id)`;

export const listFamily = (accountId: string) =>
  query<{ id: string; firstName: string; relation: Relation }>(
    `SELECT id, first_name AS "firstName", relation FROM family_members WHERE account_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [accountId],
  );

export async function addFamilyMember(accountId: string, firstName: string, relation: Relation) {
  const n = await one<{ n: number }>('SELECT count(*)::int AS n FROM family_members WHERE account_id = $1 AND deleted_at IS NULL', [
    accountId,
  ]);
  if ((n?.n ?? 0) >= MAX_FAMILY) throw conflict('You can add at most 6 people.', 'too_many_members');
  const r = await one<{ id: string }>('INSERT INTO family_members (account_id, first_name, relation) VALUES ($1,$2,$3) RETURNING id', [
    accountId,
    firstName,
    relation,
  ]);
  return { id: r!.id, firstName, relation };
}

/** Removes a person from the lists; requests already made keep their label until the account is deleted. */
export async function removeFamilyMember(accountId: string, id: string): Promise<void> {
  const r = await pool.query('UPDATE family_members SET deleted_at = now() WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL', [
    id,
    accountId,
  ]);
  if (!r.rowCount) throw notFound('Family member not found.');
}

/** True when this person belongs to the account and is still in its list. */
export async function ownsMember(accountId: string, id: string): Promise<boolean> {
  return !!(await one('SELECT 1 FROM family_members WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL', [id, accountId]));
}
