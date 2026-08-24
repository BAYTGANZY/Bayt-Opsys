import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Combobox: pick a suggested value or type a new one, saved as free text.
 *
 * Renders its own dropdown panel instead of native <input list> + <datalist>.
 * The datalist popup is drawn by the browser/OS chrome, not the page, so it
 * can't be restyled — on Windows/Chrome it shows up as a plain dark listbox
 * regardless of the site's theme. Chrome also draws its own arrow icon inside
 * an <input list> field, which stacked with any icon we add ourselves. A
 * custom panel avoids both: full control over colours, and only one chevron.
 */
export function EditableSelect({
  value,
  onChange,
  options,
  style,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const activeIndex = Math.min(highlight, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <input
        style={{ ...style, width: "100%", paddingRight: 34 }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); return; }
          if (e.key === "Enter" && open && filtered[activeIndex]) { e.preventDefault(); choose(filtered[activeIndex]); }
        }}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      <ChevronDown
        size={16}
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#6B7280", cursor: "pointer" }}
      />
      {open && filtered.length > 0 && (
        <div className="bayt-combobox-panel" role="listbox">
          {filtered.map((o, i) => (
            <div
              key={o}
              role="option"
              aria-selected={o === value}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              onMouseEnter={() => setHighlight(i)}
              className={`bayt-combobox-option${i === activeIndex ? " bayt-combobox-option--active" : ""}`}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
