import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function ImageLightbox({
  images,
  startIndex,
  onClose,
}: {
  images: Array<{ id: string; url: string }>;
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const touchX = useRef<number | null>(null);

  const prev = () => setIdx((i) => (i - 1 + images.length) % images.length);
  const next = () => setIdx((i) => (i + 1) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  if (!images.length) return null;
  const img = images[idx];

  const btn: React.CSSProperties = {
    position: "absolute",
    background: "rgba(255,255,255,0.1)",
    border: "none",
    color: "#fff",
    width: 48,
    height: 48,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
        touchX.current = null;
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <button
        onClick={onClose}
        aria-label="Stäng"
        style={{ ...btn, top: 16, right: 16 }}
      >
        <X size={24} />
      </button>
      {images.length > 1 && (
        <>
          <button onClick={prev} aria-label="Föregående" style={{ ...btn, left: 16, top: "50%", transform: "translateY(-50%)" }}>
            <ChevronLeft size={28} />
          </button>
          <button onClick={next} aria-label="Nästa" style={{ ...btn, right: 16, top: "50%", transform: "translateY(-50%)" }}>
            <ChevronRight size={28} />
          </button>
        </>
      )}
      <img
        src={img.url}
        alt=""
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
      {images.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            color: "#fff",
            fontSize: 13,
            background: "rgba(0,0,0,0.4)",
            padding: "4px 10px",
            borderRadius: 999,
          }}
        >
          {idx + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
