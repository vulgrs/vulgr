import React from 'react';
import claudeLogo from '../assets/agents/claude.svg';
import codexLogo from '../assets/agents/codex.svg';
import opencodeLogo from '../assets/agents/opencode.svg';
import antigravityLogo from '../assets/agents/antigravity.svg';
import cursorLogo from '../assets/agents/cursor.svg';

/** Each agent's own logo (via Lobe Icons), keyed by the installer's agent id. */
const LOGOS: Record<string, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  opencode: opencodeLogo,
  agy: antigravityLogo,
  cursor: cursorLogo,
};

/** The logo on a dark rounded tile, like an app icon; the same in both themes. */
export const AgentLogo: React.FC<{ id: string; name: string; size: number; dim?: boolean; className?: string }> = ({
  id,
  name,
  size,
  dim,
  className = '',
}) => (
  <span
    className={`flex-shrink-0 flex items-center justify-center bg-[#18181b] border border-white/10 transition-opacity ${
      dim ? 'opacity-35' : ''
    } ${className}`}
    style={{ width: size, height: size, borderRadius: size * 0.26 }}
  >
    {LOGOS[id] ? (
      <img src={LOGOS[id]} alt={name} draggable={false} style={{ width: size * 0.56, height: size * 0.56 }} />
    ) : (
      <span className="text-zinc-100 font-semibold" style={{ fontSize: size * 0.4 }}>
        {name[0]}
      </span>
    )}
  </span>
);
