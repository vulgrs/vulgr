import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, LogIn, LogOut, Moon, Sun, X } from 'lucide-react';
import { useGitHubAuth } from '../hooks/useGitHubAuth.js';
import { useI18n } from '../i18n/index.js';
import { useTheme } from '../theme.js';
import settingsIcon from '../assets/sidebar/settings.svg';

/** Sidebar footer card: GitHub sign-in when signed out, the signed-in user's profile otherwise. */
export const ProfileCard: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const { t } = useI18n();
  const { theme, toggle: toggleTheme } = useTheme();
  const { state, login, cancel, logout, openProfile } = useGitHubAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  const user = state.status === 'signed-in' ? state.user : null;

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user) setMenuOpen((v) => !v);
    else if (state.status === 'signed-out') void login();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="relative flex-shrink-0 mx-[7px] mt-2 mb-[42px]">
      {/* Device-code prompt while waiting for the browser approval */}
      {state.status === 'pending' && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-[12px] bg-base-elevated border border-zinc-800 shadow-lg p-3 z-50 text-[9px] text-zinc-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-100 text-[10px]">{t.profile.signInTitle}</span>
            <button onClick={cancel} className="p-0.5 rounded text-zinc-600 hover:text-zinc-100" title={t.common.cancel}>
              <X size={11} />
            </button>
          </div>
          <p className="leading-relaxed text-zinc-500">{t.profile.enterCode}</p>
          <button
            onClick={() => copyCode(state.userCode)}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-[7px] bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
            title={t.profile.copyCode}
          >
            <span className="text-[15px] tracking-[0.2em] text-zinc-100">{state.userCode}</span>
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-zinc-500" />}
          </button>
          <div className="mt-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Loader2 size={10} className="animate-spin" />
              {t.profile.waiting}
            </span>
            <button
              onClick={() => openProfile(state.verificationUri)}
              className="flex items-center gap-1 text-zinc-100 hover:underline"
            >
              {t.profile.openPage} <ExternalLink size={9} />
            </button>
          </div>
        </div>
      )}

      {state.status === 'signed-out' && state.error && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-[12px] bg-base-elevated border border-red-900/60 p-2.5 z-50 text-[9px] text-red-400 leading-relaxed">
          {t.profile.errors[state.error] ?? state.error}
        </div>
      )}

      {/* Account menu */}
      {user && menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-0 right-0 mb-2 rounded-[12px] bg-base-elevated border border-zinc-800 shadow-lg p-1.5 z-50 text-[10px]"
        >
          <button
            onClick={() => {
              openProfile(user.htmlUrl);
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[7px] text-zinc-100 hover:bg-white/5 text-left transition-colors"
          >
            <ExternalLink size={11} className="text-zinc-500" />
            {t.profile.openGitHubProfile}
          </button>
          <button
            onClick={() => {
              logout();
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[7px] text-red-400 hover:bg-red-950/40 text-left transition-colors"
          >
            <LogOut size={11} />
            {t.profile.signOut}
          </button>
        </div>
      )}

      <div className="h-[52px] rounded-[12px] bg-base-elevated border border-zinc-800 flex items-center pl-[19px] pr-[19px]">
        <button
          onClick={handleCardClick}
          disabled={state.status === 'loading' || state.status === 'pending'}
          className="flex-1 min-w-0 flex items-center text-left"
          title={user ? t.profile.accountMenu(user.login) : t.profile.signInTitle}
        >
          <div className="relative w-[31px] h-[31px] flex-shrink-0">
            <span className="absolute inset-0 rounded-full bg-zinc-900 border border-zinc-700" />
            {user ? (
              <img
                src={user.avatarUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-zinc-500">
                {state.status === 'loading' || state.status === 'pending' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <LogIn size={13} />
                )}
              </span>
            )}
          </div>
          <div className="ml-[10px] min-w-0 flex-1 leading-none">
            <div className="text-[11px] text-zinc-100 truncate">
              {user ? user.name || user.login : state.status === 'pending' ? t.profile.signingIn : t.profile.signIn}
            </div>
            <div className="mt-[2px] text-[8.5px] text-zinc-500 truncate">
              {user ? `@${user.login}` : t.profile.withGitHub}
            </div>
          </div>
        </button>
        <button
          onClick={toggleTheme}
          className="p-1 mr-0.5 rounded-[5px] text-zinc-500 hover:text-zinc-100 hover:bg-white/5 transition-colors flex-shrink-0"
          title={theme === 'dark' ? t.profile.toLight : t.profile.toDark}
        >
          {theme === 'dark' ? <Sun size={11} /> : <Moon size={11} />}
        </button>
        <button
          onClick={onOpenSettings}
          className="p-1 rounded-[5px] hover:bg-white/5 transition-colors flex-shrink-0"
          title={t.profile.settings}
        >
          <img src={settingsIcon} alt="" draggable={false} style={{ width: 8 * 1.4, height: 7 * 1.4 }} />
        </button>
      </div>
    </div>
  );
};
