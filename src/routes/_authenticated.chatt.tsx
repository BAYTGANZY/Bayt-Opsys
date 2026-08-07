import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Chatting01Icon, Add01Icon, ArrowLeft01Icon, CheckmarkCircle01Icon, SentIcon, Delete02Icon, MessageCircleReplyIcon, Cancel01Icon, Image02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { renderChatText } from "@/lib/chat-format";
import { confirmDialog } from "@/components/ConfirmDialog";
import { sanitizeStorageName, useSignedFileUrls } from "@/lib/storage";

type Search = { c?: string };

export const Route = createFileRoute("/_authenticated/chatt")({
  head: () => ({ meta: [{ title: "Chatt — BAYT" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    c: typeof s.c === "string" ? s.c : undefined,
  }),
  component: ChattPage,
});

const C = {
  pageBg: "#F7F8F7",
  card: "#FFFFFF",
  border: "#E9EBE9",
  green: "#5CB84A",
  greenDark: "#3D8A30",
  text: "#111318",
  secondary: "#5B6169",
  muted: "#9AA0A6",
};

const headingFont = "Outfit, Inter, system-ui, sans-serif";
const bodyFont = "Inter, system-ui, sans-serif";

type ProfileLite = { id: string; full_name: string | null; avatar_url: string | null; role: string | null };

type ConversationRow = { id: string; type: "direct" | "group"; name: string | null; created_at: string };

type Conversation = ConversationRow & {
  participants: ProfileLite[];
  myLastReadAt: string | null;
  lastMessage: Message | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** Set = soft-deleted by its sender; body is blank and a tombstone is rendered. */
  deleted_at: string | null;
  /** Message this one is quoting, or null. Nulled by the DB (FK ON DELETE SET
   *  NULL) when the target is hard-deleted, so a dangling reference never lingers. */
  reply_to_id: string | null;
  /** Stored getPublicUrl() link into the private `chat-files` bucket — resolve
   *  through useSignedFileUrls before rendering, same as every other bucket. */
  attachment_url: string | null;
  attachment_type: string | null;
};

const MESSAGE_COLUMNS =
  "id, conversation_id, sender_id, body, created_at, deleted_at, reply_to_id, attachment_url, attachment_type";

/**
 * Newest-wins comparison used to pick a conversation's preview message.
 * `id` breaks ties so two messages written in the same instant still resolve
 * to a stable winner instead of whichever one the server happened to return first.
 */
function isNewerMessage(candidate: Message, current: Message | null | undefined): boolean {
  if (!current) return true;
  if (candidate.created_at !== current.created_at) return candidate.created_at > current.created_at;
  return candidate.id > current.id;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function Avatar({ name, url, size = 36 }: { name: string | null; url?: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? ""}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", background: C.green, color: "#0D2B1E",
        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
        fontSize: size * 0.4, flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

/** Overlapping avatar stack for a group conversation's topbar. */
function AvatarStack({ participants, size = 32, max = 5 }: { participants: ProfileLite[]; size?: number; max?: number }) {
  const visible = participants.slice(0, max);
  const overflow = participants.length - visible.length;
  const overlap = Math.round(size * 0.4);
  return (
    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      {visible.map((p, i) => (
        <div
          key={p.id}
          style={{
            marginLeft: i === 0 ? 0 : -overlap,
            zIndex: visible.length - i,
            border: "2px solid #fff",
            borderRadius: "50%",
            lineHeight: 0,
          }}
        >
          <Avatar name={p.full_name} url={p.avatar_url} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            marginLeft: -overlap, zIndex: 0, width: size, height: size, borderRadius: "50%",
            border: "2px solid #fff", background: C.border, color: C.secondary, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

/** Hover-revealed (always visible on touch) trash next to a deletable bubble. */
function DeleteMessageButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Radera meddelande"
      title="Radera meddelande"
      style={{
        // 32px, not 26: a comfortable touch target on phones (26px reads fine on
        // desktop but is tight to tap accurately) — always-visible on touch anyway.
        flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "none",
        background: "transparent", color: C.muted, cursor: busy ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : 1,
        padding: 0, touchAction: "manipulation",
      }}
    >
      <HugeiconsIcon icon={Delete02Icon} size={15} />
    </button>
  );
}

/** Hover-revealed (always visible on touch) reply icon next to any bubble. */
function ReplyMessageButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Svara på meddelande"
      title="Svara"
      style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "none",
        background: "transparent", color: C.muted, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        touchAction: "manipulation",
      }}
    >
      <HugeiconsIcon icon={MessageCircleReplyIcon} size={15} />
    </button>
  );
}

/** One-line sidebar preview of a conversation's most recent message. */
function messagePreview(message: Message | null): string {
  if (!message) return "Inga meddelanden än";
  if (message.deleted_at) return "Meddelandet togs bort";
  if (!message.body.trim()) return message.attachment_url ? "📷 Bild" : "";
  // The bubble renders **bold** and honours newlines; the preview is a single
  // clipped line, so drop the markers and collapse the whitespace.
  const text = message.body.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return message.attachment_url ? `📷 ${text}` : text;
}

function conversationTitle(conv: Conversation, selfId: string): string {
  if (conv.type === "group") return conv.name || "Grupp";
  const other = conv.participants.find((p) => p.id !== selfId);
  return other?.full_name ?? "—";
}

function conversationAvatar(conv: Conversation, selfId: string): { name: string | null; url: string | null } {
  if (conv.type === "group") return { name: conv.name ?? "Grupp", url: null };
  const other = conv.participants.find((p) => p.id !== selfId);
  return { name: other?.full_name ?? null, url: other?.avatar_url ?? null };
}

async function fetchMyConversations(selfId: string): Promise<Conversation[]> {
  const { data: myRows, error: myErr } = await supabase
    .from("chat_participants")
    .select("conversation_id, last_read_at")
    .eq("profile_id", selfId);
  if (myErr) throw myErr;
  const convIds = (myRows ?? []).map((r) => r.conversation_id as string);
  if (convIds.length === 0) return [];

  const [{ data: convs, error: convErr }, { data: allParticipants, error: partErr }, { data: messages, error: msgErr }] =
    await Promise.all([
      supabase.from("chat_conversations").select("id, type, name, created_at").in("id", convIds),
      supabase
        .from("chat_participants")
        .select("conversation_id, profiles(id, full_name, avatar_url, role)")
        .in("conversation_id", convIds),
      supabase
        .from("chat_messages")
        .select(MESSAGE_COLUMNS)
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
    ]);
  if (convErr) throw convErr;
  if (partErr) throw partErr;
  if (msgErr) throw msgErr;

  const lastReadByConv = new Map((myRows ?? []).map((r) => [r.conversation_id as string, r.last_read_at as string | null]));
  const participantsByConv = new Map<string, ProfileLite[]>();
  for (const row of allParticipants ?? []) {
    const p = row.profiles as unknown as ProfileLite | null;
    if (!p) continue;
    const list = participantsByConv.get(row.conversation_id as string) ?? [];
    list.push(p);
    participantsByConv.set(row.conversation_id as string, list);
  }
  // Compare timestamps instead of taking the first row per conversation: relying
  // on the server's row order made the sidebar show the *oldest* message whenever
  // that order wasn't exactly newest-first.
  const lastMessageByConv = new Map<string, Message>();
  for (const m of (messages ?? []) as Message[]) {
    if (isNewerMessage(m, lastMessageByConv.get(m.conversation_id))) {
      lastMessageByConv.set(m.conversation_id, m);
    }
  }

  const result: Conversation[] = (convs ?? []).map((c) => ({
    id: c.id,
    type: c.type as "direct" | "group",
    name: c.name,
    created_at: c.created_at,
    participants: participantsByConv.get(c.id) ?? [],
    myLastReadAt: lastReadByConv.get(c.id) ?? null,
    lastMessage: lastMessageByConv.get(c.id) ?? null,
  }));

  result.sort((a, b) => {
    const at = a.lastMessage?.created_at ?? a.created_at;
    const bt = b.lastMessage?.created_at ?? b.created_at;
    return bt.localeCompare(at);
  });
  return result;
}

const messagesKey = (conversationId: string) => ["chat-messages", conversationId] as const;
const receiptsKey = (conversationId: string) => ["chat-receipts", conversationId] as const;

async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  // Throw instead of falling back to []: a swallowed error here renders an empty
  // thread that looks exactly like "no messages yet", i.e. like the conversation
  // lost its history. The row is still in the database — only the read failed.
  if (error) throw error;
  return (data ?? []) as Message[];
}

async function fetchReadReceipts(conversationId: string): Promise<Record<string, string | null>> {
  const { data, error } = await supabase
    .from("chat_participants")
    .select("profile_id, last_read_at")
    .eq("conversation_id", conversationId);
  if (error) throw error;
  const map: Record<string, string | null> = {};
  for (const row of data ?? []) map[row.profile_id as string] = row.last_read_at as string | null;
  return map;
}

/**
 * Merge one row into the thread, deduped by id. The realtime echo and the
 * insert's own response race each other and either can land first, so append
 * is not safe — and an out-of-order arrival has to sort back into place.
 */
function upsertMessage(list: Message[] | undefined, incoming: Message): Message[] {
  const prev = list ?? [];
  const at = prev.findIndex((m) => m.id === incoming.id);
  if (at !== -1) {
    const next = prev.slice();
    next[at] = { ...next[at], ...incoming };
    return next;
  }
  return [...prev, incoming].sort((a, b) =>
    a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at),
  );
}

function ChattPage() {
  const { profile, user } = useAuth();
  const selfId = user?.id ?? "";
  const isAdmin = profile?.role === "admin";
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/chatt" });
  const selectedId = search.c ?? null;
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["chat-conversations", selfId],
    queryFn: () => fetchMyConversations(selfId),
    enabled: !!selfId,
  });

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Live-refresh the conversation list when I'm added to a new conversation.
  useEffect(() => {
    if (!selfId) return;
    const refreshList = () => queryClient.invalidateQueries({ queryKey: ["chat-conversations", selfId] });
    const channel = supabase
      .channel(`chat-membership-${selfId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_participants", filter: `profile_id=eq.${selfId}` },
        refreshList,
      )
      // Unfiltered on purpose — RLS already limits these events to conversations
      // I'm in. ConversationView only refreshes the chat that's open, so without
      // this the preview of every *other* conversation stayed stale.
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, refreshList)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selfId, queryClient]);

  const selectConversation = (id: string | null) => {
    navigate({ to: "/chatt", search: id ? { c: id } : {} });
  };

  const showList = !isMobile || !selectedId;
  const showConversation = !isMobile || !!selectedId;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, background: C.pageBg, fontFamily: bodyFont }}>
      {showList && (
        <div
          style={{
            width: isMobile ? "100%" : 320,
            flexShrink: 0,
            borderRight: isMobile ? "none" : `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ padding: "18px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h1 style={{ fontFamily: headingFont, fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>Chatt</h1>
            <button
              onClick={() => setShowNew(true)}
              aria-label="Ny konversation"
              title="Ny konversation"
              style={{
                width: 32, height: 32, borderRadius: "50%", background: C.green, color: "#fff",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <HugeiconsIcon icon={Add01Icon} size={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {isLoading ? (
              <div style={{ padding: 24, color: C.secondary, fontSize: 13 }}>Laddar…</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <HugeiconsIcon icon={Chatting01Icon} size={26} color={C.muted} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: C.secondary }}>Inga konversationer ännu</div>
              </div>
            ) : (
              conversations.map((conv) => {
                const { name, url } = conversationAvatar(conv, selfId);
                const title = conversationTitle(conv, selfId);
                const unread = !!conv.lastMessage && (!conv.myLastReadAt || conv.lastMessage.created_at > conv.myLastReadAt) && conv.lastMessage.sender_id !== selfId;
                const active = conv.id === selectedId;
                return (
                  <div
                    key={conv.id}
                    onClick={() => selectConversation(conv.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
                      cursor: "pointer", background: active ? "#F0F4EF" : "transparent",
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {conv.type === "group" ? (
                      <AvatarStack participants={conv.participants} size={30} max={3} />
                    ) : (
                      <Avatar name={name} url={url} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: unread ? 700 : 600, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {title}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: unread ? C.text : C.secondary, fontWeight: unread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {messagePreview(conv.lastMessage)}
                      </div>
                    </div>
                    {unread && <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, flexShrink: 0 }} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {showConversation && (
        selected ? (
          <ConversationView
            // Reset per-conversation UI state (draft, hover) on switch — without
            // this the component is reused and a draft follows you into the next chat.
            key={selected.id}
            conversation={selected}
            selfId={selfId}
            isAdmin={isAdmin}
            isMobile={isMobile}
            onBack={isMobile ? () => selectConversation(null) : undefined}
          />
        ) : (
          !isMobile && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
              <div style={{ textAlign: "center" }}>
                <HugeiconsIcon icon={Chatting01Icon} size={32} color={C.muted} />
                <div style={{ marginTop: 8, fontSize: 14 }}>Välj en konversation</div>
              </div>
            </div>
          )
        )
      )}

      {showNew && (
        <NewConversationModal
          isAdmin={isAdmin}
          selfId={selfId}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            queryClient.invalidateQueries({ queryKey: ["chat-conversations", selfId] });
            selectConversation(id);
          }}
        />
      )}
    </div>
  );
}

function ConversationView({
  conversation,
  selfId,
  isAdmin,
  isMobile,
  onBack,
}: {
  conversation: Conversation;
  selfId: string;
  isAdmin: boolean;
  isMobile: boolean;
  onBack?: () => void;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Object URL for the pending image's local preview — revoked whenever it's
  // replaced or the user removes it, so a fast pick-then-remove doesn't leak.
  useEffect(() => {
    if (!pendingImage) {
      setPendingImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPendingImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  const applyImageFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Endast bilder kan bifogas.");
      return;
    }
    setPendingImage(file);
  };

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    applyImageFile(file);
  };

  // Ctrl/Cmd+V with an image on the clipboard (a screenshot, or a copied image
  // from elsewhere) attaches it the same as picking a file — a plain text paste
  // is untouched since no clipboard item matches image/*.
  const pasteImage = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    applyImageFile(item.getAsFile());
  };

  // Composer height is user-resizable via the drag handle above the textarea
  // (see composerDragStart below) — dragging up grows it so more text is
  // visible while typing; native `resize` only offers a bottom-right handle,
  // which would grow the box downward off-screen since the composer sits at
  // the bottom of the page.
  const COMPOSER_MIN_HEIGHT = 40;
  const COMPOSER_MAX_HEIGHT = 320;
  const [composerHeight, setComposerHeight] = useState(COMPOSER_MIN_HEIGHT);
  const composerDragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const composerDragMove = useCallback((e: PointerEvent) => {
    const drag = composerDragRef.current;
    if (!drag) return;
    const next = Math.min(
      COMPOSER_MAX_HEIGHT,
      Math.max(COMPOSER_MIN_HEIGHT, drag.startHeight + (drag.startY - e.clientY))
    );
    setComposerHeight(next);
  }, []);

  const composerDragEnd = useCallback(() => {
    composerDragRef.current = null;
    document.removeEventListener("pointermove", composerDragMove);
    document.removeEventListener("pointerup", composerDragEnd);
  }, [composerDragMove]);

  const composerDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    composerDragRef.current = { startY: e.clientY, startHeight: composerHeight };
    document.addEventListener("pointermove", composerDragMove);
    document.addEventListener("pointerup", composerDragEnd);
  };

  // The thread lives in the query cache, not component state: re-entering a
  // conversation then renders from cache instead of blanking to [] while a
  // fresh fetch runs, and TanStack re-syncs it on focus/reconnect. Realtime is
  // otherwise the only way local state hears about a message, so a dropped
  // socket would leave a permanent gap.
  const {
    data: messages = [],
    isPending: messagesPending,
    isError: messagesFailed,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: messagesKey(conversation.id),
    queryFn: () => fetchMessages(conversation.id),
    staleTime: 30_000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const attachmentUrls = useMemo(() => messages.map((m) => m.attachment_url), [messages]);
  const resolveAttachmentUrl = useSignedFileUrls(attachmentUrls);

  const { data: participants = {} } = useQuery({
    queryKey: receiptsKey(conversation.id),
    queryFn: () => fetchReadReceipts(conversation.id),
    staleTime: 30_000,
  });

  const title = conversationTitle(conversation, selfId);
  const { name: avatarName, url: avatarUrl } = conversationAvatar(conversation, selfId);
  const otherIds = conversation.participants.filter((p) => p.id !== selfId).map((p) => p.id);

  // Full thread history is always loaded (no pagination), so a reply's target is
  // always resolvable here unless it was hard-deleted — in which case the DB
  // already nulled reply_to_id via ON DELETE SET NULL and there's nothing to find.
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of conversation.participants) map.set(p.id, p.full_name ?? "—");
    return map;
  }, [conversation.participants]);
  const senderLabel = (id: string) => (id === selfId ? "Dig" : (nameById.get(id) ?? "—"));

  const scrollToMessage = (id: string) => {
    const el = bubbleRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    window.setTimeout(() => setHighlightedId((prev) => (prev === id ? null : prev)), 1500);
  };

  const markRead = async () => {
    await supabase
      .from("chat_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversation.id)
      .eq("profile_id", selfId);
  };

  useEffect(() => {
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    const key = messagesKey(conversation.id);
    const channel = supabase
      .channel(`chat-messages-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new as Message;
          queryClient.setQueryData<Message[]>(key, (prev) => upsertMessage(prev, row));
          // Keeps the sidebar preview in step with the thread.
          queryClient.invalidateQueries({ queryKey: ["chat-conversations", selfId] });
          if (row.sender_id !== selfId) markRead();
        },
      )
      // Soft delete arrives as an UPDATE (body scrubbed, deleted_at set)…
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          queryClient.setQueryData<Message[]>(key, (prev) => upsertMessage(prev, payload.new as Message));
          queryClient.invalidateQueries({ queryKey: ["chat-conversations", selfId] });
        },
      )
      // …an admin delete as a real DELETE. Needs REPLICA IDENTITY FULL on
      // chat_messages, otherwise the old row has no conversation_id to filter on.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const old = payload.old as Partial<Message>;
          if (!old?.id) return;
          queryClient.setQueryData<Message[]>(key, (prev) => (prev ?? []).filter((m) => m.id !== old.id));
          queryClient.invalidateQueries({ queryKey: ["chat-conversations", selfId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_participants", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new as { profile_id: string; last_read_at: string | null };
          queryClient.setQueryData<Record<string, string | null>>(receiptsKey(conversation.id), (prev) => ({
            ...(prev ?? {}),
            [row.profile_id]: row.last_read_at,
          }));
        },
      )
      .subscribe((status) => {
        // Closes two windows in which a message would never reach local state:
        // the gap between the initial fetch and this subscription going live,
        // and every later reconnect after the socket drops.
        if (status === "SUBSCRIBED") queryClient.invalidateQueries({ queryKey: key });
      });
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, selfId, queryClient]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const seenByAllOthers = (createdAt: string) =>
    otherIds.length > 0 && otherIds.every((id) => participants[id] && participants[id]! >= createdAt);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    const image = pendingImage;
    if ((!text && !image) || sending) return;
    const replyToId = replyingTo?.id ?? null;
    setSending(true);
    setSendError(null);
    setBody("");
    setPendingImage(null);

    let attachmentUrl: string | null = null;
    let attachmentType: string | null = null;
    if (image) {
      const path = `${conversation.id}/${Date.now()}-${sanitizeStorageName(image.name)}`;
      const { error: uploadError } = await supabase.storage.from("chat-files").upload(path, image);
      if (uploadError) {
        setSending(false);
        setBody(text);
        setPendingImage(image);
        setSendError(`Bilden kunde inte laddas upp: ${uploadError.message}`);
        return;
      }
      attachmentUrl = supabase.storage.from("chat-files").getPublicUrl(path).data.publicUrl;
      attachmentType = image.type;
    }

    // Read the row back rather than waiting for the realtime echo to render it:
    // if the socket is down the message is still committed, and the thread has
    // to show what the database now holds.
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        conversation_id: conversation.id,
        sender_id: selfId,
        body: text,
        reply_to_id: replyToId,
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    setSending(false);
    if (error) {
      // Surface the failure — silently restoring the draft looked like the
      // message had been sent and then swallowed. Keep the reply quote too,
      // for the same reason.
      setBody(text);
      if (image) setPendingImage(image);
      setSendError(`Meddelandet kunde inte skickas: ${error.message}`);
      return;
    }
    setReplyingTo(null);
    queryClient.setQueryData<Message[]>(messagesKey(conversation.id), (prev) =>
      upsertMessage(prev, data as Message),
    );
    queryClient.invalidateQueries({ queryKey: ["chat-conversations", selfId] });
  };

  // Admin deletes leave nothing behind; everyone else leaves a tombstone.
  // The rule itself lives in delete_chat_message() — this only picks the wording
  // and applies the matching local update (realtime confirms it for everyone else).
  const onDelete = async (m: Message) => {
    if (deletingId) return;
    const ok = await confirmDialog({
      title: "Radera meddelandet?",
      message: isAdmin
        ? "Det raderas permanent och försvinner helt för alla."
        : 'Det ersätts med "Meddelandet togs bort" för alla.',
      confirmLabel: "Radera",
      danger: true,
    });
    if (!ok) return;

    setDeletingId(m.id);
    const { data, error } = await supabase.rpc("delete_chat_message", { p_message_id: m.id });
    setDeletingId(null);
    if (error) {
      toast.error(`Kunde inte radera meddelandet: ${error.message}`);
      return;
    }
    const key = messagesKey(conversation.id);
    if (data === "removed") {
      queryClient.setQueryData<Message[]>(key, (prev) => (prev ?? []).filter((x) => x.id !== m.id));
    } else {
      queryClient.setQueryData<Message[]>(key, (prev) =>
        (prev ?? []).map((x) => (x.id === m.id ? { ...x, body: "", deleted_at: new Date().toISOString() } : x)),
      );
    }
    queryClient.invalidateQueries({ queryKey: ["chat-conversations", selfId] });
  };

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, background: C.card }}>
      <div
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 12,
          padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Tillbaka"
            style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 4, color: C.text }}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={20} />
          </button>
        )}
        {conversation.type === "group" ? (
          <AvatarStack participants={conversation.participants} size={32} />
        ) : (
          <Avatar name={avatarName} url={avatarUrl} size={32} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{title}</div>
          {conversation.type === "group" && (
            <div
              style={{
                fontSize: 12, color: C.secondary, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", maxWidth: 420,
              }}
            >
              {conversation.participants.map((p) => p.full_name ?? "—").join(", ")}
            </div>
          )}
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messagesFailed && (
          <div style={{ margin: "auto", textAlign: "center", maxWidth: 320 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Meddelandena kunde inte hämtas</div>
            <div style={{ fontSize: 12, color: C.secondary, marginTop: 6, lineHeight: 1.5 }}>
              Ingenting har raderats — historiken finns kvar. Försök igen.
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{(messagesError as Error | null)?.message}</div>
            <button
              onClick={() => refetchMessages()}
              style={{
                marginTop: 12, padding: "8px 16px", background: C.green, color: "#fff", border: "none",
                borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Försök igen
            </button>
          </div>
        )}
        {!messagesFailed && messagesPending && (
          <div style={{ margin: "auto", fontSize: 13, color: C.secondary }}>Laddar meddelanden…</div>
        )}
        {!messagesFailed && !messagesPending && messages.length === 0 && (
          <div style={{ margin: "auto", fontSize: 13, color: C.muted }}>Inga meddelanden än</div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === selfId;
          const removed = !!m.deleted_at;
          const seen = mine && !removed && seenByAllOthers(m.created_at);
          // Nobody deletes someone else's message, admin included — the other
          // party's turns stay in the thread. Own message only, and only once
          // (a non-admin tombstone can't be deleted a second time).
          const canDelete = mine && !removed;
          const showActions = !removed && (isMobile || hoveredId === m.id || deletingId === m.id);
          const quoted = m.reply_to_id ? messagesById.get(m.reply_to_id) : undefined;
          const highlighted = highlightedId === m.id;
          return (
            <div
              key={m.id}
              onMouseEnter={() => setHoveredId(m.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === m.id ? null : prev))}
              style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, justifyContent: mine ? "flex-end" : "flex-start" }}
            >
              {mine && !removed && (
                // Actions stay mounted (opacity-toggled, not conditionally rendered) so
                // hovering away never un-mounts them mid-interaction: that used to pull
                // the bubble ~64px sideways the instant the mouse left the row (twice as
                // far as a received message's single button), reading as a jarring
                // "zoom"/jump — worst right after tapping Svara, since the reply bar
                // opening below shifts the row out from under a stationary cursor.
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                    opacity: showActions ? 1 : 0, pointerEvents: showActions ? "auto" : "none",
                    transition: "opacity 0.15s ease",
                  }}
                >
                  <DeleteMessageButton onClick={() => onDelete(m)} busy={deletingId === m.id} />
                  <ReplyMessageButton onClick={() => setReplyingTo(m)} />
                </div>
              )}
              <div
                ref={(el) => {
                  if (el) bubbleRefs.current.set(m.id, el);
                  else bubbleRefs.current.delete(m.id);
                }}
                style={{
                  maxWidth: "70%",
                  padding: "8px 12px",
                  borderRadius: 14,
                  background: removed ? "#F5F6F5" : mine ? C.greenDark : "#F0F1EF",
                  border: removed ? `1px dashed ${C.border}` : highlighted ? `1px solid ${C.green}` : "none",
                  boxShadow: highlighted ? `0 0 0 3px rgba(92, 184, 74, 0.35)` : "none",
                  color: removed ? C.muted : mine ? "#fff" : C.text,
                  fontSize: 14,
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  transition: "box-shadow 0.2s ease",
                }}
              >
                {m.reply_to_id && !removed && (
                  <div
                    onClick={() => scrollToMessage(m.reply_to_id!)}
                    style={{
                      cursor: quoted ? "pointer" : "default",
                      borderLeft: `3px solid ${mine ? "rgba(255,255,255,0.55)" : C.green}`,
                      paddingLeft: 8,
                      marginBottom: 6,
                      opacity: 0.85,
                      // 100%, not a fixed px cap: on a narrow phone the bubble's own
                      // 70vw max-width already leaves less than 260px of content
                      // room, so a fixed cap here overflowed past the bubble edge.
                      maxWidth: "100%",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700 }}>
                      {quoted ? senderLabel(quoted.sender_id) : "Borttaget meddelande"}
                    </div>
                    {quoted && (
                      <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {messagePreview(quoted)}
                      </div>
                    )}
                  </div>
                )}
                {m.attachment_url && !removed && (
                  <a
                    href={resolveAttachmentUrl(m.attachment_url)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "block", marginBottom: m.body.trim() ? 6 : 0 }}
                  >
                    <img
                      src={resolveAttachmentUrl(m.attachment_url)}
                      alt="Bifogad bild"
                      style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, display: "block", objectFit: "cover" }}
                    />
                  </a>
                )}
                {(removed || m.body.trim() || !m.attachment_url) && (
                  <div style={removed ? { fontStyle: "italic" } : undefined}>
                    {removed ? (mine ? "Du tog bort meddelandet" : "Meddelandet togs bort") : renderChatText(m.body)}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 10, marginTop: 4, opacity: 0.75, display: "flex", alignItems: "center",
                    gap: 4, justifyContent: "flex-end",
                  }}
                >
                  {new Date(m.created_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                  {mine && !removed && (
                    <HugeiconsIcon icon={seen ? CheckmarkCircle01Icon : SentIcon} size={11} color={seen ? "#5CB84A" : mine ? "#fff" : C.muted} />
                  )}
                </div>
              </div>
              {!mine && !removed && (
                <div
                  style={{
                    display: "flex", alignItems: "center", flexShrink: 0,
                    opacity: showActions ? 1 : 0, pointerEvents: showActions ? "auto" : "none",
                    transition: "opacity 0.15s ease",
                  }}
                >
                  <ReplyMessageButton onClick={() => setReplyingTo(m)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sendError && (
        <div style={{ padding: "8px 16px", background: "#FEF2F2", color: "#B91C1C", fontSize: 12, borderTop: `1px solid ${C.border}` }}>
          {sendError}
        </div>
      )}

      {replyingTo && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", minWidth: 0,
            borderTop: `1px solid ${C.border}`, background: "#F7F8F7",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, borderLeft: `3px solid ${C.green}`, paddingLeft: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
              Svarar {senderLabel(replyingTo.sender_id)}
            </div>
            <div style={{ fontSize: 12, color: C.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {messagePreview(replyingTo)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Avbryt svar"
            title="Avbryt svar"
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "none",
              background: "transparent", color: C.muted, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              touchAction: "manipulation",
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} />
          </button>
        </div>
      )}

      {pendingImagePreview && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", minWidth: 0,
            borderTop: `1px solid ${C.border}`, background: "#F7F8F7",
          }}
        >
          <img
            src={pendingImagePreview}
            alt=""
            style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pendingImage?.name}
          </div>
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            aria-label="Ta bort bild"
            title="Ta bort bild"
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "none",
              background: "transparent", color: C.muted, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              touchAction: "manipulation",
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} />
          </button>
        </div>
      )}

      <form onSubmit={onSend} style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: `1px solid ${C.border}`, alignItems: "flex-end" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={pickImage}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Bifoga bild"
          title="Bifoga bild"
          style={{
            flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`,
            background: "transparent", color: C.secondary, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <HugeiconsIcon icon={Image02Icon} size={18} />
        </button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            onPointerDown={composerDragStart}
            title="Dra för att ändra höjd"
            style={{
              height: 8, margin: "-4px 0", cursor: "ns-resize", display: "flex",
              alignItems: "center", justifyContent: "center", touchAction: "none",
            }}
          >
            <div style={{ width: 32, height: 4, borderRadius: 2, background: C.border }} />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend(e as unknown as FormEvent);
              }
            }}
            onPaste={pasteImage}
            placeholder="Skriv ett meddelande…"
            style={{
              height: composerHeight, resize: "none", border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "10px 14px", fontSize: 14, fontFamily: bodyFont, color: C.text, overflowY: "auto",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={(!body.trim() && !pendingImage) || sending}
          style={{
            padding: "0 18px", height: 40, background: C.green, color: "#fff", border: "none", borderRadius: 10,
            fontWeight: 600, fontSize: 14, cursor: body.trim() || pendingImage ? "pointer" : "default",
            opacity: body.trim() || pendingImage ? 1 : 0.6,
          }}
        >
          Skicka
        </button>
      </form>
    </div>
  );
}

function NewConversationModal({
  isAdmin,
  selfId,
  onClose,
  onCreated,
}: {
  isAdmin: boolean;
  selfId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [candidates, setCandidates] = useState<ProfileLite[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      const q = supabase.from("profiles").select("id, full_name, avatar_url, role").neq("id", selfId);
      const { data } = isAdmin ? await q : await q.eq("role", "admin");
      setCandidates((data ?? []) as ProfileLite[]);
    };
    load();
  }, [isAdmin, selfId]);

  const filtered = useMemo(
    () => candidates.filter((c) => (c.full_name ?? "").toLowerCase().includes(query.toLowerCase())),
    [candidates, query],
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const isGroup = isAdmin && selectedIds.length > 1;

  const onCreate = async () => {
    if (selectedIds.length === 0) return;
    setCreating(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("create_chat_conversation", {
      p_participant_ids: selectedIds,
      p_is_group: isGroup,
      p_name: isGroup ? groupName || null : null,
    });
    setCreating(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onCreated(data as string);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, width: 380, maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontFamily: headingFont, color: C.text }}>
          Ny konversation
        </div>
        <div style={{ padding: "12px 20px", flex: 1, overflowY: "auto" }}>
          {isAdmin && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök person…"
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
            />
          )}
          {filtered.map((p) => (
            <label
              key={p.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: "pointer" }}
            >
              <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
              <Avatar name={p.full_name} url={p.avatar_url} size={28} />
              <span style={{ fontSize: 14, color: C.text }}>{p.full_name ?? "—"}</span>
            </label>
          ))}
          {filtered.length === 0 && <div style={{ fontSize: 13, color: C.secondary, padding: "8px 4px" }}>Inga träffar</div>}
          {isGroup && (
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Gruppnamn (valfritt)"
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, marginTop: 10, boxSizing: "border-box" }}
            />
          )}
          {error && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 8 }}>{error}</div>}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            Avbryt
          </button>
          <button
            onClick={onCreate}
            disabled={selectedIds.length === 0 || creating}
            style={{ padding: "8px 16px", background: C.green, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: selectedIds.length === 0 ? 0.6 : 1 }}
          >
            {creating ? "Skapar…" : "Starta"}
          </button>
        </div>
      </div>
    </div>
  );
}
