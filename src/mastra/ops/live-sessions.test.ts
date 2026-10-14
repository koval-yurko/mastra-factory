/**
 * The live-sessions tracker and route. Sessions are fakes with the four
 * readers the route uses; the controller is a fake that records listeners.
 */
import { describe, expect, it } from 'vitest';
import type { IntegrationContext } from '@mastra/factory';
import {
  LIVE_SESSIONS_PATH,
  LiveSessionTracker,
  liveSessions,
  type LiveSession,
  type SessionSource,
} from './live-sessions';

function fakeSession(id: string, options: { running?: boolean; parked?: boolean; project?: string } = {}) {
  const status = { running: options.running ?? false, parked: options.parked ?? false };
  const session: LiveSession = {
    identity: { getId: () => id },
    run: { isRunning: () => status.running },
    displayState: { get: () => ({ pendingSuspensions: { size: status.parked ? 1 : 0 } }) },
    state: { get: () => ({ factoryProjectId: options.project }) },
  };
  return { session, status };
}

function fakeController() {
  const created: ((session: LiveSession) => void)[] = [];
  const deleted: ((session: LiveSession) => void)[] = [];
  const source: SessionSource = {
    onSessionCreated: listener => (created.push(listener), () => {}),
    onSessionDeleted: listener => (deleted.push(listener), () => {}),
  };
  return {
    source,
    create: (session: LiveSession) => created.forEach(listener => listener(session)),
    remove: (session: LiveSession) => deleted.forEach(listener => listener(session)),
  };
}

describe('LiveSessionTracker', () => {
  it('reports running and parked sessions, and counts idle ones', () => {
    const controller = fakeController();
    const tracker = new LiveSessionTracker(controller.source);
    controller.create(fakeSession('a', { running: true, project: 'p1' }).session);
    controller.create(fakeSession('b', { parked: true }).session);
    controller.create(fakeSession('c').session);

    expect(tracker.snapshot()).toEqual({
      running: [{ id: 'a', factoryProjectId: 'p1' }],
      parked: [{ id: 'b', factoryProjectId: null }],
      total: 3,
    });
  });

  it('reads the state on every call, not when the session appeared', () => {
    const controller = fakeController();
    const tracker = new LiveSessionTracker(controller.source);
    const { session, status } = fakeSession('a');
    controller.create(session);
    expect(tracker.snapshot().running).toEqual([]);

    status.running = true;
    expect(tracker.snapshot().running).toEqual([{ id: 'a', factoryProjectId: null }]);
  });

  it('forgets a deleted session', () => {
    const controller = fakeController();
    const tracker = new LiveSessionTracker(controller.source);
    const { session } = fakeSession('a', { running: true });
    controller.create(session);
    controller.remove(session);

    expect(tracker.snapshot()).toEqual({ running: [], parked: [], total: 0 });
  });
});

describe('liveSessions route', () => {
  type Auth = IntegrationContext['auth'];
  const openAuth: Auth = {
    enabled: () => false,
    ensureUser: async () => undefined,
    tenant: () => undefined,
    isOrganizationAdmin: async () => false,
  };
  const fakeContext = { json: (body: unknown, status = 200) => ({ body, status }) };

  function call(auth: Auth, controller?: SessionSource) {
    const route = liveSessions.routes({ auth, controller } as unknown as IntegrationContext)[0]!;
    expect(route.path).toBe(LIVE_SESSIONS_PATH);
    expect(route.method).toBe('GET');
    const handler = (route as unknown as { handler: (c: unknown) => Promise<{ body: unknown; status: number }> }).handler;
    return handler(fakeContext);
  }

  it('serves the snapshot when auth is off', async () => {
    const controller = fakeController();
    const response = call(openAuth, controller.source);
    expect(await response).toEqual({ body: { running: [], parked: [], total: 0 }, status: 200 });
  });

  it('refuses a caller who is not signed in', async () => {
    const auth: Auth = { ...openAuth, enabled: () => true };
    expect((await call(auth, fakeController().source)).status).toBe(401);
  });

  it('refuses a signed-in caller who is not an organization admin', async () => {
    const auth: Auth = { ...openAuth, enabled: () => true, tenant: () => ({ orgId: 'o', userId: 'u' }) };
    expect((await call(auth, fakeController().source)).status).toBe(403);
  });

  it('serves an organization admin', async () => {
    const auth: Auth = {
      ...openAuth,
      enabled: () => true,
      tenant: () => ({ orgId: 'o', userId: 'u' }),
      isOrganizationAdmin: async () => true,
    };
    expect((await call(auth, fakeController().source)).status).toBe(200);
  });

  it('answers 503 without an agent controller', async () => {
    expect((await call(openAuth)).status).toBe(503);
  });
});
