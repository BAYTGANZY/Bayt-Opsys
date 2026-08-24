import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const C = {
  card: "#FFFFFF",
  border: "#E9EBE9",
  text: "#1a1a1a",
  placeholder: "#9AA0A6",
  chevron: "#6B7280",
  chevronDisabled: "#C7CBD1",
  disabledBg: "#F7F8F7",
  hoverRow: "#F5F6F5",
  selectedRow: "#F0F7EE",
  selectedRowHover: "#E7F2E4",
  selectedText: "#0D2B1E",
  accent: "#3D8A30",
};

const PANEL_MAX_H = 300;
const GAP = 6;

type Opt = { value: string; label: string; disabled: boolean };

/** `<option>Lgh {nr}</option>` arrives as ["Lgh ", "1203"]; flatten to text. */
function optionText(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(optionText).join("");
  if (typeof node === "object" && "props" in (node as never)) {
    return optionText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}

/**
 * ChevronSelect — the app's dropdown.
 *
 * A native <select> can be styled shut but not open: the option list is drawn
 * by the operating system, so the popup stays a flat white panel with a system
 * blue highlight, bold system text and square corners, sitting on top of a UI
 * that is soft-cornered, green-accented and shadowed everywhere else. CSS
 * cannot reach it — an `option { … }` rule is ignored for the popup itself on
 * Windows/Chrome. So on pointer devices this renders its own listbox: a field
 * button plus a portalled panel, in the same language as the notis-panelen
 * (radius 14, soft shadow, green tint on the chosen row).
 *
 * **On touch it stays a real <select>** — the OS wheel/sheet picker beats
 * anything a floating div can do on a phone, and the closed field is identical
 * either way.
 *
 * The API is a plain <select>'s: pass `<option>` children and an `onChange`
 * reading `e.target.value`. Anything it cannot re-render faithfully (an
 * <optgroup>, a non-option child) falls back to the native element.
 *
 * Geometry is *not* set here — the caller passes its own form's `inputStyle`,
 * so a dropdown always lines up with the text fields beside it.
 */
export function ChevronSelect({
  style,
  disabled,
  isPlaceholder,
  className,
  children,
  value,
  onChange,
  id,
  name,
  required,
  "aria-label": ariaLabel,
  title,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Muted "nothing chosen yet" look. Defaults to the value being empty. */
  isPlaceholder?: boolean;
}) {
  const isMobile = useIsMobile();
  const listId = useId();

  const current = value == null ? "" : String(value);
  // A resting dropdown should read as a prompt ("Välj fastighet"), not as an
  // answer someone already filled in.
  const muted = isPlaceholder ?? current === "";

  const parsed = useMemo(() => parseOptions(children), [children]);
  const options = parsed.options;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === current);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : "";

  const measure = useCallback(() => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  // The form scrolls inside <main>, not the window, so the listener has to be
  // in the capture phase to see that scroll at all.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Keep the highlighted row in view when arrowing past the panel's edge.
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function emit(next: string) {
    onChange?.({
      target: { value: next, name: name ?? "" },
      currentTarget: { value: next, name: name ?? "" },
    } as unknown as React.ChangeEvent<HTMLSelectElement>);
  }

  function choose(i: number) {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    if (opt.value !== current) emit(opt.value);
    setOpen(false);
    btnRef.current?.focus();
  }

  function openAt(i: number) {
    setActive(i < 0 ? 0 : i);
    setOpen(true);
  }

  function step(from: number, dir: 1 | -1) {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openAt(selectedIndex);
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => step(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => step(i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActive(step(-1, 1));
        break;
      case "End":
        e.preventDefault();
        setActive(step(options.length, -1));
        break;
      case "Tab":
        setOpen(false);
        break;
      default: {
        if (e.key.length !== 1 || e.altKey || e.ctrlKey || e.metaKey) return;
        const now = Date.now();
        typed.current.text = now - typed.current.at > 600 ? e.key : typed.current.text + e.key;
        typed.current.at = now;
        const q = typed.current.text.toLowerCase();
        const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q));
        if (hit >= 0) setActive(hit);
      }
    }
  }

  // Anything this cannot faithfully re-render goes back to the native element
  // rather than silently dropping a choice.
  const native = isMobile || !parsed.safe;

  const fieldStyle: React.CSSProperties = {
    ...style,
    width: "100%",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    // Clears the chevron, so a long fastighetsnamn ellipsises before it
    // reaches the icon instead of running underneath it.
    paddingRight: 34,
    textOverflow: "ellipsis",
    cursor: disabled ? "not-allowed" : "pointer",
    // A disabled field recedes on its own; dimming the whole control takes the
    // label and chevron down with it.
    ...(disabled ? { background: C.disabledBg, color: C.placeholder } : muted ? { color: C.placeholder } : null),
  };

  const chevron = (
    <ChevronDown
      size={16}
      aria-hidden
      className="bayt-select-chevron"
      style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none", color: disabled ? C.chevronDisabled : C.chevron,
      }}
    />
  );

  if (native) {
    return (
      <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
        <select
          {...rest}
          id={id}
          name={name}
          required={required}
          aria-label={ariaLabel}
          title={title}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={className ? `bayt-select ${className}` : "bayt-select"}
          style={fieldStyle}
        >
          {children}
        </select>
        {chevron}
      </div>
    );
  }

  const placement = panelPlacement(rect);

  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
      {/* Passthrough props are typed for a <select>; on this path the field is
          a <button>, and the two differ only in the element type their handlers
          receive. Cast rather than drop them, so an aria-* or data-* attribute
          added at a call site still lands. */}
      <button
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={btnRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        data-open={open ? "true" : undefined}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={onKeyDown}
        className={className ? `bayt-select ${className}` : "bayt-select"}
        style={{
          ...fieldStyle,
          display: "flex",
          alignItems: "center",
          textAlign: "left",
          // A <button> does not inherit type: Chrome's UA sheet gives it
          // `font: 400 13.33px Arial`. The field has to read as the text input
          // beside it, so both are restated — but only where the caller's own
          // style has not already spoken.
          fontFamily: "inherit",
          fontWeight: style?.fontWeight ?? 400,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedLabel}
        </span>
      </button>
      {chevron}

      {open && rect && createPortal(
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          style={{
            position: "fixed",
            left: rect.left,
            width: rect.width,
            ...placement.pos,
            maxHeight: placement.maxH,
            overflowY: "auto",
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            boxShadow: "0 1px 2px rgba(13,43,30,0.04), 0 18px 40px -12px rgba(13,43,30,0.28)",
            padding: 6,
            // Above the modal/bottom-sheet layer (1000): a dropdown opened
            // from inside a dialog has to draw over the dialog.
            zIndex: 1100,
            animation: "bayt-notif-panel-in 0.14s ease-out",
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 14, color: C.placeholder }}>
              Inga alternativ
            </div>
          )}
          {options.map((o, i) => {
            const isSelected = o.value === current;
            const isActive = i === active;
            return (
              <div
                key={`${o.value}-${i}`}
                data-idx={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onMouseEnter={() => !o.disabled && setActive(i)}
                onClick={() => choose(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 10px",
                  borderRadius: 9,
                  fontSize: 14,
                  fontWeight: isSelected ? 600 : 500,
                  lineHeight: 1.35,
                  color: o.disabled ? C.placeholder : isSelected ? C.selectedText : C.text,
                  background: isSelected
                    ? (isActive ? C.selectedRowHover : C.selectedRow)
                    : (isActive && !o.disabled ? C.hoverRow : "transparent"),
                  cursor: o.disabled ? "not-allowed" : "pointer",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.label}
                </span>
                {isSelected && <Check size={16} style={{ flexShrink: 0, color: C.accent }} />}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Flip above the field when the space below cannot hold a usable list. */
function panelPlacement(rect: DOMRect | null): { pos: React.CSSProperties; maxH: number } {
  if (!rect) return { pos: { top: 0 }, maxH: PANEL_MAX_H };
  const below = window.innerHeight - rect.bottom - GAP - 8;
  const above = rect.top - GAP - 8;
  if (below < 180 && above > below) {
    return { pos: { bottom: window.innerHeight - rect.top + GAP }, maxH: Math.min(PANEL_MAX_H, above) };
  }
  return { pos: { top: rect.bottom + GAP }, maxH: Math.min(PANEL_MAX_H, below) };
}

function parseOptions(children: React.ReactNode): { options: Opt[]; safe: boolean } {
  const options: Opt[] = [];
  let safe = true;

  const walk = (node: React.ReactNode) => {
    if (node == null || node === false || node === true || node === "") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === "object" && "type" in (node as never)) {
      const el = node as React.ReactElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>;
      if (el.type === "option") {
        options.push({
          value: el.props.value == null ? optionText(el.props.children) : String(el.props.value),
          label: optionText(el.props.children),
          disabled: !!el.props.disabled,
        });
        return;
      }
    }
    // A fragment, an <optgroup>, a rendered component — not something this can
    // re-draw faithfully, so the whole control drops back to native.
    safe = false;
  };

  walk(children);
  return { options, safe };
}
