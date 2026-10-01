interface AudioLoaderProps {
  text?: string;
  className?: string;
  compact?: boolean;
}

export function AudioLoader({
  text = "Đang tải luồng âm thanh...",
  className = "",
  compact = false,
}: AudioLoaderProps) {
  return (
    <div
      className={`audio-loader-wrapper ${compact ? "audio-loader-compact" : ""} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="audio-loader-firefox" aria-hidden="true">
        <div className="circle">
          <div className="dot"></div>
          <div className="outline"></div>
        </div>
        <div className="circle">
          <div className="dot"></div>
          <div className="outline"></div>
        </div>
        <div className="circle">
          <div className="dot"></div>
          <div className="outline"></div>
        </div>
        <div className="circle">
          <div className="dot"></div>
          <div className="outline"></div>
        </div>
      </div>
      {text && <p className="audio-loader-caption">{text}</p>}
    </div>
  );
}
