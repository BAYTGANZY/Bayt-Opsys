import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification03Icon, Alert02Icon, Chatting01Icon } from "@hugeicons/core-free-icons";
import { useAkutIssues } from "@/components/AkutWatcher";
import {
  formatNotificationTime,
  previewText,
  useNotifications,
  TOAST_MS,
  type ChatNotification,
} from "@/lib/notifications";

const C = {
  card: "#FFFFFF",
  border: "#E9EBE9",
  green: "#5CB84A",
  text: "#111318",
  secondary: "#5B6169",
  muted: "#9AA0A6",
  red: "#DC2626",
};

const headingFont = "Outfit, Inter, system-ui, sans-serif";

/** Distance a drag has to travel upward before the toast is let go. */
const SWIPE_DISMISS_PX = 40;

function initial(name: string | null | undefined): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function Avatar({
  name,
  url,
  size = 38,
}: {
  name: string | null;
  url: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    display: "block",
  } as const;
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: "cover" }}
      />
    );
  }
  // <span>, not <div>: these avatars sit inside the <button> rows of the panel.
  return (
    <span
      style={{
        ...base,
        background: C.green,
        color: "#0D2B1E",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initial(name)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Bell + dropdown panel                                                      */
/* -------------------------------------------------------------------------- */

export function NotificationBell({ isMobile }: { isMobile: boolean }) {
  const navigate = useNavigate();
  const { items, unreadCount, isUnread, markConversationRead, markAllRead } = useNotifications();
  const akut = useAkutIssues();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badge = unreadCount + akut.length;
  const hasAkut = akut.length > 0;

  const openConversation = (n: ChatNotification) => {
    markConversationRead(n.conversationId);
    setOpen(false);
    navigate({ to: "/chatt", search: { c: n.conversationId } });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={badge > 0 ? `${badge} notiser` : "Inga notiser"}
        title={badge > 0 ? `${badge} notiser` : "Inga notiser"}
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          color: hasAkut ? "#FF6B6B" : open ? "#ffffff" : "rgba(255,255,255,0.7)",
          cursor: "pointer",
          padding: 8,
          minWidth: 40,
          minHeight: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: hasAkut ? "bayt-bell-pulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        <HugeiconsIcon icon={Notification03Icon} size={20} />
        {badge > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: hasAkut ? C.red : C.green,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              border: "2px solid #0D2B1E",
              boxSizing: "content-box",
            }}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notiser"
          style={{
            position: isMobile ? "fixed" : "absolute",
            top: isMobile ? 60 : 46,
            right: isMobile ? 8 : 0,
            left: isMobile ? 8 : undefined,
            width: isMobile ? undefined : 360,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            boxShadow: "0 1px 2px rgba(13,43,30,0.04), 0 18px 40px -12px rgba(13,43,30,0.28)",
            zIndex: 100,
            overflow: "hidden",
            animation: "bayt-notif-panel-in 0.16s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "12px 14px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontFamily: headingFont, fontSize: 15, fontWeight: 600, color: C.text }}>
              Notiser
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#3D8A30",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "inherit",
                }}
              >
                Markera alla som lästa
              </button>
            )}
          </div>

          <div style={{ maxHeight: "min(60vh, 420px)", overflowY: "auto" }}>
            {akut.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/issues/$id", params: { id: a.id } });
                }}
                className="bayt-notif-row"
                style={{ borderLeft: `3px solid ${C.red}` }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: "#FEE2E2",
                    color: C.red,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <HugeiconsIcon icon={Alert02Icon} size={18} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.red }}>
                    Akut ärende
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      color: C.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.title}
                  </span>
                </span>
              </button>
            ))}

            {items.map((n) => {
              const unread = isUnread(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openConversation(n)}
                  className="bayt-notif-row"
                  style={{ background: unread ? "#F4F8F3" : "transparent" }}
                >
                  <Avatar name={n.senderName} url={n.senderAvatar} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13.5,
                          fontWeight: unread ? 700 : 600,
                          color: C.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.senderName ?? "Okänd avsändare"}
                        {n.groupName && (
                          <span style={{ fontWeight: 400, color: C.secondary }}>
                            {" "}
                            i {n.groupName}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
                        {formatNotificationTime(n.createdAt)}
                      </span>
                    </span>
                    <span
                      className="bayt-notif-preview"
                      style={{ color: unread ? C.text : C.secondary }}
                    >
                      {previewText(n.body)}
                    </span>
                  </span>
                  {unread && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: C.green,
                        flexShrink: 0,
                        alignSelf: "center",
                      }}
                    />
                  )}
                </button>
              );
            })}

            {akut.length === 0 && items.length === 0 && (
              <div style={{ padding: "36px 20px", textAlign: "center" }}>
                <HugeiconsIcon icon={Notification03Icon} size={24} color={C.muted} />
                <div style={{ marginTop: 8, fontSize: 13, color: C.secondary }}>Inga notiser</div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/chatt", search: {} });
            }}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderTop: `1px solid ${C.border}`,
              background: "#FBFBFA",
              border: "none",
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              color: C.secondary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontFamily: "inherit",
            }}
          >
            <HugeiconsIcon icon={Chatting01Icon} size={14} />
            Öppna chatten
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toast popups under the top bar                                             */
/* -------------------------------------------------------------------------- */

export function NotificationToasts({ isMobile }: { isMobile: boolean }) {
  const navigate = useNavigate();
  const { toasts, dismissToast, markConversationRead } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: isMobile ? 64 : 80,
        right: isMobile ? 8 : 24,
        left: isMobile ? 8 : undefined,
        zIndex: 65,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((n) => (
        <ToastCard
          key={n.id}
          notification={n}
          onDismiss={dismissToast}
          onOpen={() => {
            markConversationRead(n.conversationId);
            dismissToast(n.id);
            navigate({ to: "/chatt", search: { c: n.conversationId } });
          }}
        />
      ))}
    </div>
  );
}

function ToastCard({
  notification: n,
  onDismiss,
  onOpen,
}: {
  notification: ChatNotification;
  onDismiss: (id: string) => void;
  onOpen: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dy, setDy] = useState(0);
  const drag = useRef({ startY: 0, active: false, moved: false });

  const close = useCallback(() => setLeaving(true), []);

  // Exit animation first, then drop it from the queue.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => onDismiss(n.id), 200);
    return () => clearTimeout(t);
  }, [leaving, n.id, onDismiss]);

  // Auto-dismiss, held back while hovered or mid-swipe so it stays readable.
  useEffect(() => {
    if (leaving || paused || dragging) return;
    const t = setTimeout(close, TOAST_MS);
    return () => clearTimeout(t);
  }, [leaving, paused, dragging, close]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, active: true, moved: false };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const delta = e.clientY - drag.current.startY;
    if (Math.abs(delta) > 6) drag.current.moved = true;
    // Upward only — dragging down does nothing.
    setDy(Math.min(0, delta));
  };

  const endDrag = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    if (dy <= -SWIPE_DISMISS_PX) close();
    else setDy(0);
  };

  return (
    <div
      onClick={() => {
        if (drag.current.moved) return;
        onOpen();
      }}
      onWheel={(e) => {
        // "Scroll up on the notification and it goes away."
        if (e.deltaY < 0) close();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
        if (e.key === "Escape") close();
      }}
      style={{
        pointerEvents: "auto",
        touchAction: "none",
        cursor: "pointer",
        width: "min(340px, calc(100vw - 16px))",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "11px 13px",
        background: C.card,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.green}`,
        boxShadow: "0 1px 2px rgba(13,43,30,0.04), 0 16px 34px -12px rgba(13,43,30,0.32)",
        transform: leaving ? "translateY(-14px)" : `translateY(${dy}px)`,
        opacity: leaving ? 0 : 1,
        transition: dragging ? "none" : "transform 0.2s ease, opacity 0.2s ease",
        animation: leaving ? "none" : "bayt-toast-in 0.22s ease-out",
      }}
    >
      <Avatar name={n.senderName} url={n.senderAvatar} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13.5,
              fontWeight: 700,
              color: C.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {n.senderName ?? "Nytt meddelande"}
            {n.groupName && (
              <span style={{ fontWeight: 400, color: C.secondary }}> i {n.groupName}</span>
            )}
          </span>
          <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
            {formatNotificationTime(n.createdAt)}
          </span>
        </div>
        <div className="bayt-notif-preview" style={{ color: C.secondary }}>
          {previewText(n.body)}
        </div>
      </div>
    </div>
  );
}
