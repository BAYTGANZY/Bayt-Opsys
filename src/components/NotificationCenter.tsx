import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification03Icon, Alert02Icon, Chatting01Icon } from "@hugeicons/core-free-icons";
import { useAkutIssues } from "@/components/AkutWatcher";
import { useArendeNotifications } from "@/hooks/useArendeNotifications";
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
  const arende = useArendeNotifications();
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

  const badge = unreadCount + arende.unreadCount + akut.length;
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
            {unreadCount + arende.unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  void markAllRead();
                  void arende.markAllRead();
                }}
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

            {arende.items.map((a) => (
              <button
                key={a.id}
                type="button"
                className="bayt-notif-row"
                style={{ background: a.readAt ? "transparent" : "#F4F8F3" }}
                onClick={() => {
                  void arende.markRead(a.id);
                  setOpen(false);
                  navigate({ to: "/projects/$id", params: { id: a.projectId } });
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: "#E8F3E5",
                    color: "#3D8A30",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <HugeiconsIcon icon={Notification03Icon} size={18} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13.5,
                      fontWeight: a.readAt ? 600 : 700,
                      color: C.text,
                    }}
                  >
                    Projekt uppdaterat
                  </span>
                  <span
                    className="bayt-notif-preview"
                    style={{ color: a.readAt ? C.secondary : C.text }}
                  >
                    {a.title} · {formatNotificationTime(a.createdAt)}
                  </span>
                </span>
                {!a.readAt && (
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

            {akut.length === 0 && items.length === 0 && arende.items.length === 0 && (
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
