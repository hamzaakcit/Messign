import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who is acting, for the audit log (WP-31). The authentication middleware (or an operator script) runs the rest of the
 * request inside `runAsActor`; `withEngageTenant` copies the actor into the transaction setting `engage.actor`, and the
 * audit triggers (migration 138) read it. Nothing here is a credential: it only labels entries, and the database refuses
 * a label that does not match the format below.
 */
const store = new AsyncLocalStorage<{ actor: string }>();

export const ACTOR_RE = /^[a-z_]+:[A-Za-z0-9._-]{1,80}$/;

export function actorLabel(kind: string, id: string): string {
  const label = `${kind}:${id}`;
  if (!ACTOR_RE.test(label)) throw new Error('Invalid audit actor label.');
  return label;
}

export function currentActor(): string | undefined {
  return store.getStore()?.actor;
}

export function runAsActor<T>(actor: string, fn: () => T): T {
  if (!ACTOR_RE.test(actor)) throw new Error('Invalid audit actor label.');
  return store.run({ actor }, fn);
}

/** For an operator's script: every database change it makes is labelled `operator:<script>` in the audit log. */
export function setOperatorActor(script: string): void {
  const actor = actorLabel('operator', script);
  store.enterWith({ actor });
}
