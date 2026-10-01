interface TextLoaderProps {
  text?: string;
  className?: string;
}

export function TextLoader({ text = "Đang nạp nội dung chương...", className = "" }: TextLoaderProps) {
  return (
    <div className={`text-loader-wrapper ${className}`.trim()} role="status" aria-live="polite">
      <div className="typewriter" aria-hidden="true">
        <div className="slide">
          <i></i>
        </div>
        <div className="paper"></div>
        <div className="keyboard"></div>
      </div>
      {text && <p className="text-loader-caption">{text}</p>}
    </div>
  );
}
