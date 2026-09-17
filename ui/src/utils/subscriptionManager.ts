/**
 * Subscription Lifecycle & Memory Leak Prevention Manager
 *
 * Tracks, groups, and cleanly disposes event listeners, IPC handlers,
 * intervals, and terminal stream pipes bound to tabs, panes, or components.
 */

import { useEffect, useRef } from 'react';

export type TeardownFn = () => void;

class SubscriptionRegistry {
  private scopes: Map<string, Set<TeardownFn>> = new Map();

  /**
   * Registers a cleanup / unsubscribe callback under a given scopeId (e.g. tab-1, sess-123).
   * Returns an unregister function for manual early disposal.
   */
  register(scopeId: string, teardown: TeardownFn): () => void {
    if (!this.scopes.has(scopeId)) {
      this.scopes.set(scopeId, new Set());
    }

    const set = this.scopes.get(scopeId)!;
    set.add(teardown);

    return () => {
      if (set.has(teardown)) {
        try {
          teardown();
        } catch (err) {
          console.error(`[SubscriptionRegistry] Error during teardown in scope "${scopeId}":`, err);
        }
        set.delete(teardown);
      }
      if (set.size === 0) {
        this.scopes.delete(scopeId);
      }
    };
  }

  /**
   * Cleans up and removes all subscriptions registered for the specified scope.
   */
  disposeScope(scopeId: string): void {
    const set = this.scopes.get(scopeId);
    if (!set) return;

    for (const teardown of set) {
      try {
        teardown();
      } catch (err) {
        console.error(`[SubscriptionRegistry] Error tearing down scope "${scopeId}":`, err);
      }
    }

    set.clear();
    this.scopes.delete(scopeId);
  }

  /**
   * Complete teardown of all scopes (e.g. window unload).
   */
  disposeAll(): void {
    for (const [scopeId, set] of this.scopes.entries()) {
      for (const teardown of set) {
        try {
          teardown();
        } catch (err) {
          console.error(`[SubscriptionRegistry] Error during global teardown "${scopeId}":`, err);
        }
      }
      set.clear();
    }
    this.scopes.clear();
  }

  getActiveCount(scopeId?: string): number {
    if (scopeId) {
      return this.scopes.get(scopeId)?.size || 0;
    }
    let total = 0;
    for (const set of this.scopes.values()) {
      total += set.size;
    }
    return total;
  }
}

export const subscriptionRegistry = new SubscriptionRegistry();

/**
 * React hook that guarantees unsubscription and lifecycle disposal.
 */
export function useManagedSubscription(
  scopeId: string,
  subscribe: () => TeardownFn | void,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    const teardown = subscribe();
    if (typeof teardown === 'function') {
      const unregister = subscriptionRegistry.register(scopeId, teardown);
      return () => {
        unregister();
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId, ...deps]);
}

/**
 * Clean polling interval that automatically disposes when scope or component unmounts.
 */
export function useScopedInterval(
  scopeId: string,
  callback: () => void,
  delayMs: number | null
): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (delayMs === null || delayMs <= 0) return;

    const id = setInterval(() => {
      savedCallback.current();
    }, delayMs);

    const unregister = subscriptionRegistry.register(scopeId, () => clearInterval(id));

    return () => {
      unregister();
    };
  }, [scopeId, delayMs]);
}
