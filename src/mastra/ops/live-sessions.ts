/**
 * `GET /web/ops/live-sessions`: which sessions this server process is working
 * on right now. `ops/deploy.sh` polls it before a restart, so a deploy never
 * cuts off an agent run (docs/ci-deploy-research.md, section 7).
 *
 * Factory's own `runningSessionIds` (on the work-item list) covers only
 * sessions bound to a work item. A chat-only session — a Slack thread, say —
 * is in no work item and so in no list Factory serves. This route reads the
 * same source Factory's `LiveSessions` does, the agent controller's
 * created/deleted notifications, and so covers every live session.
 *
 * Running and parked are read from the session itself on every request, never
 * tracked from events: a missed event cannot leave an answer stuck.
 *
 * The state is in this process's memory only. After a restart the list is
 * empty, which is why the deploy reads it BEFORE it restarts the server.
 */
import { registerApiRoute } from '@mastra/core/server';
import type { FactoryIntegration } from '@mastra/factory';

export const LIVE_SESSIONS_PATH = '/web/ops/live-sessions';

/** The part of a controller session this route reads. */
export interface LiveSession {
  identity: { getId(): string };
  run: { isRunning(): boolean };
  displayState: { get(): { pendingSuspensions: { size: number } } };
  state: { get(): { factoryProjectId?: string } };
}

/** The part of the agent controller this route subscribes to. */
export interface SessionSource {
  onSessionCreated(listener: (session: LiveSession) => void): () => void;
  onSessionDeleted(listener: (session: LiveSession) => void): () => void;
}

export interface LiveSessionsSnapshot {
  /** Sessions with an agent run in flight. */
  running: { id: string; factoryProjectId: string | null }[];
  /** Sessions that wait for a human answer (a suspended tool call). */
  parked: { id: string; factoryProjectId: string | null }[];
  /** Every session this process holds, idle ones included. */
  total: number;
}

/** Follows the controller's sessions and answers what each one is doing now. */
export class LiveSessionTracker {
  readonly #sessions = new Map<string, LiveSession>();

  constructor(source: SessionSource) {
    source.onSessionCreated(session => this.#sessions.set(session.identity.getId(), session));
    source.onSessionDeleted(session => this.#sessions.delete(session.identity.getId()));
  }

  snapshot(): LiveSessionsSnapshot {
    const running: LiveSessionsSnapshot['running'] = [];
    const parked: LiveSessionsSnapshot['parked'] = [];
    for (const [id, session] of this.#sessions) {
      const entry = { id, factoryProjectId: session.state.get().factoryProjectId ?? null };
      if (session.run.isRunning()) running.push(entry);
      if (session.displayState.get().pendingSuspensions.size > 0) parked.push(entry);
    }
    return { running, parked, total: this.#sessions.size };
  }
}

/**
 * The integration that serves the route. It has no tools, workers or storage.
 * Authentication follows Factory's own admin routes: with auth on, the caller
 * must be signed in and administer their organization.
 */
export const liveSessions: FactoryIntegration = {
  id: 'live-sessions',
  diagnostics: () => ({ path: LIVE_SESSIONS_PATH }),
  routes: ctx => {
    // Subscribed at boot, before the server takes a request, so no session is missed.
    const tracker = ctx.controller ? new LiveSessionTracker(ctx.controller as unknown as SessionSource) : undefined;
    return [
      registerApiRoute(LIVE_SESSIONS_PATH, {
        method: 'GET',
        requiresAuth: false,
        handler: async c => {
          const { auth } = ctx;
          if (auth.enabled()) {
            await auth.ensureUser(c);
            const tenant = auth.tenant(c);
            if (!tenant) return c.json({ error: 'unauthorized' }, 401);
            if (!tenant.orgId || !(await auth.isOrganizationAdmin(c, tenant.orgId))) {
              return c.json({ error: 'forbidden' }, 403);
            }
          }
          if (!tracker) return c.json({ error: 'no_agent_controller' }, 503);
          return c.json(tracker.snapshot());
        },
      }),
    ];
  },
};
