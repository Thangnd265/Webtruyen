import React from "react";
import { Mic, Sparkles, Check, Volume2 } from "lucide-react";
import type { VoiceOption } from "../data/api";

interface VoiceSelectorProps {
  voices?: VoiceOption[];
  currentVoice?: string;
  onSelectVoice: (voiceId: string) => void;
  compact?: boolean;
  className?: string;
}

export function VoiceSelector({
  voices = [],
  currentVoice,
  onSelectVoice,
  compact = false,
  className = "",
}: VoiceSelectorProps) {
  if (!voices || voices.length === 0) return null;

  // Single voice display badge
  if (voices.length === 1) {
    const single = voices[0];
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-zinc-400 bg-zinc-900/80 border border-zinc-800 ${className}`}
        title="Truyện hiện có 1 phiên bản giọng đọc"
      >
        <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
        <span className="font-medium text-zinc-300">{single.name}</span>
        {single.gender && (
          <span className="text-[10px] text-zinc-400">
            ({single.gender} · {single.region || "Bắc"})
          </span>
        )}
      </div>
    );
  }

  // Multi-voice selector
  return (
    <div
      className={`flex flex-col gap-2 ${className}`}
      role="radiogroup"
      aria-label="Chọn phiên bản giọng đọc"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 tracking-wide uppercase">
        <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />
        <span>Chọn phiên bản giọng đọc ({voices.length} bản):</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {voices.map((v) => {
          const isActive = Boolean(
            currentVoice === v.id ||
            (currentVoice && currentVoice.toLowerCase() === v.id.toLowerCase())
          );
          const isAiClone =
            v.id.includes("omni") ||
            v.name.toLowerCase().includes("omni") ||
            v.name.toLowerCase().includes("clone");

          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onSelectVoice(v.id)}
              className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isActive
                  ? "bg-zinc-800 text-white border-2 border-emerald-500 shadow-lg shadow-emerald-500/10 scale-[1.02]"
                  : "bg-zinc-900/90 text-zinc-300 border border-zinc-700/80 hover:bg-zinc-800/80 hover:border-zinc-600 hover:text-white"
              }`}
              style={{
                transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            >
              {isActive ? (
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-zinc-600 group-hover:bg-zinc-400 transition-colors" />
              )}

              <span className="font-semibold">{v.name}</span>

              {v.gender && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-zinc-400 border border-zinc-800">
                  {v.gender} · {v.region || "Bắc"}
                </span>
              )}

              {isAiClone && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Sparkles className="w-2.5 h-2.5" />
                  AI Clone
                </span>
              )}

              {isActive && (
                <Check className="w-3.5 h-3.5 text-emerald-400 ml-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
