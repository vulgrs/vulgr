import React, { useRef } from 'react';
import { Paperclip, ArrowUp, Square, X } from 'lucide-react';
import { ModelMenu } from './ModelMenu.js';
import type { EffortLevel, ImageAttachment, ModelOption } from './types.js';

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  model: ModelOption;
  effort: EffortLevel;
  onSelectModel: (m: ModelOption) => void;
  onSelectEffort: (e: EffortLevel) => void;
  attachments: ImageAttachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  running?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
}

/**
 * The zeron-style prompt box: a rounded elevated card with a textarea,
 * image attachments, a model/effort menu and a circular send button.
 */
export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Do anything…',
  model,
  effort,
  onSelectModel,
  onSelectEffort,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  running,
  onStop,
  autoFocus,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0 && Array.from(files).some((f) => f.type.startsWith('image/'))) {
      onAddFiles(files);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#151517] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_18px_40px_-12px_rgba(0,0,0,0.7)] focus-within:border-white/20 transition-colors">
      {/* Attachment thumbnails */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/10 group"
            >
              <img src={a.previewUrl} alt={a.name} className="w-full h-full object-cover" />
              <button
                onClick={() => onRemoveAttachment(a.id)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-zinc-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent outline-none px-4 pt-3.5 pb-1 text-[14px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 max-h-56 min-h-[52px]"
      />

      <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
        <div className="flex items-center gap-2.5 text-[12px] select-none">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onAddFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Attach images"
          >
            <Paperclip size={15} />
          </button>
          <ModelMenu
            model={model}
            effort={effort}
            onSelectModel={onSelectModel}
            onSelectEffort={onSelectEffort}
          />
        </div>

        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="w-8 h-8 rounded-full bg-zinc-200 hover:bg-white text-black flex items-center justify-center transition-colors"
            title="Stop"
          >
            <Square size={13} className="fill-black" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim() && attachments.length === 0}
            className="w-8 h-8 rounded-full bg-zinc-200 enabled:hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-500 text-black flex items-center justify-center transition-colors"
            title="Send"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
};
