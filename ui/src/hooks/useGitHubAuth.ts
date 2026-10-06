import { useCallback, useEffect, useState } from 'react';

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; error?: string }
  | { status: 'pending'; userCode: string; verificationUri: string }
  | { status: 'signed-in'; user: GitHubUser };

/** GitHub sign-in state backed by the main process device flow (electron/githubAuth.ts). */
export function useGitHubAuth() {
  const api = typeof window !== 'undefined' ? window.warpApi : undefined;
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    if (!api?.getAuthUser) {
      setState({ status: 'signed-out' });
      return;
    }
    let alive = true;
    api
      .getAuthUser()
      .then((user: GitHubUser | null) => {
        if (alive) setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
      })
      .catch(() => alive && setState({ status: 'signed-out' }));

    const offChanged = api.onAuthChanged((user: GitHubUser | null) =>
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' })
    );
    const offError = api.onAuthError((error: string) => setState({ status: 'signed-out', error }));
    return () => {
      alive = false;
      offChanged?.();
      offError?.();
    };
  }, [api]);

  const login = useCallback(async () => {
    if (!api?.startGitHubLogin) return;
    const res = await api.startGitHubLogin();
    if ('error' in res) setState({ status: 'signed-out', error: res.error });
    else setState({ status: 'pending', userCode: res.userCode, verificationUri: res.verificationUri });
  }, [api]);

  const cancel = useCallback(() => {
    api?.cancelGitHubLogin?.();
    setState({ status: 'signed-out' });
  }, [api]);

  const logout = useCallback(() => {
    api?.logout?.();
  }, [api]);

  const openProfile = useCallback(
    (url: string) => {
      api?.openGitHubProfile?.(url);
    },
    [api]
  );

  return { state, login, cancel, logout, openProfile };
}
