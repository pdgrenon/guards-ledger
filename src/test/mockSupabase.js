/**
 * In-memory Supabase test double for exercising useSupabaseSync.
 *
 * Models one `campaigns` table plus a Realtime bus, so several client
 * instances pointed at the same backend converge the way real devices do:
 * a write from one client is broadcast to every subscribed client (including
 * the writer, so echo-suppression can be exercised).
 *
 * Only the surface useSupabaseSync actually uses is implemented:
 *   client.channel(name).on(event, opts, cb).subscribe(statusCb)
 *   client.removeChannel(channel)
 *   client.from('campaigns').update(payload).eq('id', id)        -> { error }
 *   client.from('campaigns').insert(row)                          -> { error }
 *   client.from('campaigns').select('*').eq('id', id).single()    -> { data, error }
 */

/** A fresh, isolated backend (one per test). */
export function createBackend() {
  return {
    rows: new Map(),      // id -> row object
    listeners: new Map(), // id -> Set<cb>
  };
}

function emit(backend, id) {
  const row = backend.rows.get(id);
  const set = backend.listeners.get(id);
  if (!set) return;
  // Copy the row so subscribers can't mutate the stored one, and snapshot the
  // listener set so a handler that (un)subscribes mid-broadcast is safe.
  for (const cb of [...set]) cb({ new: { ...row } });
}

/**
 * Build a mock client bound to whatever backend `getBackend()` currently
 * returns. The indirection lets a single module-level client (created once at
 * import, like the real `supabase` singleton) target a per-test backend.
 */
export function createMockClient(getBackend) {
  return {
    channel() {
      let regId = null;
      let regCb = null;
      const channel = {
        on(_event, opts, cb) {
          const m = /id=eq\.(.+)$/.exec(opts?.filter ?? '');
          regId = m ? m[1] : null;
          regCb = cb;
          return channel;
        },
        subscribe(statusCb) {
          const backend = getBackend();
          if (regId && regCb) {
            if (!backend.listeners.has(regId)) backend.listeners.set(regId, new Set());
            backend.listeners.get(regId).add(regCb);
            channel._reg = { backend, id: regId, cb: regCb };
          }
          statusCb?.('SUBSCRIBED');
          return channel;
        },
      };
      return channel;
    },
    removeChannel(channel) {
      const reg = channel?._reg;
      if (reg) reg.backend.listeners.get(reg.id)?.delete(reg.cb);
    },
    from() {
      const backend = getBackend();
      return {
        update(payload) {
          return {
            eq(_col, id) {
              const existing = backend.rows.get(id) ?? { id };
              backend.rows.set(id, { ...existing, ...payload });
              emit(backend, id);
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(row) {
          if (backend.rows.has(row.id)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
          }
          backend.rows.set(row.id, { ...row });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(_col, id) {
              return {
                single() {
                  const row = backend.rows.get(id);
                  return Promise.resolve(
                    row
                      ? { data: { ...row }, error: null }
                      : { data: null, error: { message: 'not found' } }
                  );
                },
              };
            },
          };
        },
      };
    },
  };
}
