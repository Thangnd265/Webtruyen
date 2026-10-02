import React, { useMemo } from "react";

interface VinylTurntableProps {
  playing: boolean;
  onTogglePlay: () => void;
  coverUrl?: string;
  title?: string;
  progress?: number; // 0 to 1
  disabled?: boolean;
}

export function VinylTurntable({
  playing,
  onTogglePlay,
  coverUrl,
  title = "Audiobook",
  progress = 0,
  disabled = false,
}: VinylTurntableProps) {
  // Calculate tonearm angle:
  // In resting position (paused): 0deg (parks in tonearm rest)
  // In playing position: swings from 23deg (outer groove) to 32deg (inner runout groove)
  const armAngle = useMemo(() => {
    if (!playing) return 0;
    const clampedProgress = Math.min(Math.max(progress, 0), 1);
    return 23 + clampedProgress * 9;
  }, [playing, progress]);

  return (
    <div
      className={`turntable-deck-container group ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      onClick={() => {
        if (!disabled) onTogglePlay();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onTogglePlay();
        }
      }}
      aria-label={
        playing
          ? `Máy đĩa than đang phát ${title}. Bấm vào để tạm dừng.`
          : `Máy đĩa than đang dừng. Bấm vào để phát ${title}.`
      }
      title={playing ? "Bấm để tạm dừng đĩa than" : "Bấm để phát đĩa than"}
    >
      {/* 1. TURNTABLE PLINTH (Thân máy đĩa than) */}
      <div className="turntable-plinth">
        {/* 4 Corner Anti-Vibration Feet */}
        <div className="turntable-foot foot-tl" />
        <div className="turntable-foot foot-tr" />
        <div className="turntable-foot foot-bl" />
        <div className="turntable-foot foot-br" />

        {/* Ambient Platter Rim Glow when playing */}
        <div className={`turntable-ambient-glow ${playing ? "active" : ""}`} />

        {/* 2. TURNTABLE PLATTER (Mâm xoay kim loại) */}
        <div className="turntable-platter">
          {/* Strobe pattern / metallic rim */}
          <div className="platter-metallic-rim" />

          {/* 3. VINYL RECORD DISC (Đĩa than siêu thực) */}
          <div className={`turntable-vinyl-disc ${playing ? "is-spinning" : "is-paused"}`}>
            {/* Concentric sound micro-grooves & surface shine */}
            <div className="vinyl-groove-rings" />

            {/* Anisotropic light reflection (2 vệt sáng hình nơ xoay) */}
            <div className="vinyl-anisotropic-sheen" />

            {/* Lead-in outer edge bevel */}
            <div className="vinyl-outer-bevel" />

            {/* Run-out inner groove zone */}
            <div className="vinyl-runout-zone" />

            {/* Center Label (Sticker đĩa than có ảnh bìa truyện) */}
            <div className="vinyl-center-label">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={`Bìa ${title}`}
                  className="vinyl-label-artwork"
                  loading="lazy"
                />
              ) : (
                <div className="vinyl-label-fallback">
                  <span>{(title || "A").trim().charAt(0).toUpperCase()}</span>
                </div>
              )}

              {/* Vintage record label rings & perimeter text */}
              <div className="vinyl-label-overlay">
                <svg viewBox="0 0 100 100" className="vinyl-label-curved-text">
                  <path
                    id="vinylLabelPath"
                    d="M 16,50 A 34,34 0 1,1 84,50"
                    fill="none"
                  />
                  <text fill="rgba(255,255,255,0.7)" fontSize="5.5" letterSpacing="0.8">
                    <textPath href="#vinylLabelPath" startOffset="50%" textAnchor="middle">
                      33 ⅓ RPM · STEREO
                    </textPath>
                  </text>
                </svg>
              </div>

              {/* Center spindle hole & brass bushing */}
              <div className="vinyl-spindle-hole">
                <div className="vinyl-spindle-pin" />
              </div>
            </div>
          </div>
        </div>

        {/* 4. MECHANICAL TONEARM (Cần đọc đĩa than động) */}
        <div
          className="turntable-tonearm-assembly"
          style={{
            transform: `rotate(${armAngle}deg)`,
            transition: "transform 0.85s cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        >
          {/* Gimbal base & counterweight */}
          <div className="tonearm-base">
            <div className="tonearm-pivot-ring" />
            <div className="tonearm-counterweight" />
          </div>

          {/* S-shaped/Curved Tonearm Shaft */}
          <div className="tonearm-rod">
            {/* Tone arm metallic specular highlight */}
            <div className="tonearm-rod-highlight" />
          </div>

          {/* Headshell & Stylus Needle Cartridge */}
          <div className="tonearm-headshell">
            <div className="tonearm-finger-lift" />
            <div className="tonearm-cartridge">
              <div className="tonearm-stylus-tip" />
            </div>
          </div>
        </div>

        {/* Tonearm Rest Cradle (Vị trí gác cần kim khi dừng) */}
        <div className="turntable-arm-rest" />

        {/* 5. DECK CONTROLS & BADGES (Chi tiết mâm đĩa cổ điển) */}
        <div className="turntable-deck-footer">
          {/* Strobe speed badge */}
          <div className="turntable-speed-badge">
            <span className="speed-dot" />
            <span className="speed-text">33 RPM</span>
          </div>

          {/* Status Indicator LED */}
          <div className="turntable-status-led-group">
            <span className={`status-led ${playing ? "led-active" : "led-idle"}`} />
            <span className="status-label">{playing ? "PLAYING" : "STANDBY"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
