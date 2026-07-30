import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

/**
 * In-app notifications for incoming chat messages.
 *
 * Read state is NOT a table of its own — it is derived from the chat's existing
 * `chat_participants.last_read_at`, so opening a conversation in /chatt clears
 * the bell badge for free (and vice versa via `markAllRead`). Nothing new to
 * migrate; the only requirement is the realtime publication chat.sql already
 * sets up for `chat_messages` + `chat_participants`.
 */

const MAX_ITEMS = 30;
const MAX_TOASTS = 3;

/** How long a toast stays on screen before sliding away (client spec: 1s). */
export const TOAST_MS = 1000;

const MESSAGE_COLUMNS = "id, conversation_id, sender_id, body, created_at, deleted_at";

export type ChatNotification = {
  /** = chat_messages.id, so the same message never notifies twice. */
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null;
  /** Set only for group threads — rendered as "Namn i Gruppnamn". */
  groupName: string | null;
  body: string;
  createdAt: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
};

type ConvLite = { id: string; type: "direct" | "group"; name: string | null };
type PersonLite = { id: string; full_name: string | null; avatar_url: string | null };

type ChatContext = {
  convs: Map<string, ConvLite>;
  people: Map<string, PersonLite>;
  lastRead: Record<string, string | null>;
  messages: MessageRow[];
};

const EMPTY_CONTEXT: ChatContext = {
  convs: new Map(),
  people: new Map(),
  lastRead: {},
  messages: [],
};

/** My conversations, their participants' profiles, and the latest messages sent to me. */
async function loadChatContext(selfId: string): Promise<ChatContext> {
  const { data: myRows, error } = await supabase
    .from("chat_participants")
    .select("conversation_id, last_read_at")
    .eq("profile_id", selfId);
  if (error) throw error;

  const lastRead: Record<string, string | null> = {};
  for (const row of myRows ?? []) {
    lastRead[row.conversation_id as string] = row.last_read_at as string | null;
  }
  const convIds = Object.keys(lastRead);
  if (convIds.length === 0) return { ...EMPTY_CONTEXT, convs: new Map(), people: new Map() };

  const [{ data: convRows }, { data: participantRows }, { data: messageRows }] = await Promise.all([
    supabase.from("chat_conversations").select("id, type, name").in("id", convIds),
    supabase
      .from("chat_participants")
      .select("profiles(id, full_name, avatar_url)")
      .in("conversation_id", convIds),
    supabase
      .from("chat_messages")
      .select(MESSAGE_COLUMNS)
      .in("conversation_id", convIds)
      .neq("sender_id", selfId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_ITEMS),
  ]);

  const convs = new Map<string, ConvLite>();
  for (const c of convRows ?? []) {
    convs.set(c.id as string, {
      id: c.id as string,
      type: c.type as "direct" | "group",
      name: (c.name as string | null) ?? null,
    });
  }

  const people = new Map<string, PersonLite>();
  for (const row of participantRows ?? []) {
    const p = row.profiles as unknown as PersonLite | null;
    if (p) people.set(p.id, p);
  }

  return { convs, people, lastRead, messages: (messageRows ?? []) as MessageRow[] };
}

function buildNotification(
  row: MessageRow,
  convs: Map<string, ConvLite>,
  people: Map<string, PersonLite>,
): ChatNotification {
  const conv = convs.get(row.conversation_id);
  const sender = people.get(row.sender_id);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: sender?.full_name ?? null,
    senderAvatar: sender?.avatar_url ?? null,
    groupName: conv?.type === "group" ? conv.name || "Grupp" : null,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** "nu" / "12 min" / "14:32" / "i går 14:32" / "3 jun 14:32" */
export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "nu";
  if (diffMin < 60) return `${diffMin} min`;

  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return time;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `i går ${time}`;

  return `${d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} ${time}`;
}

/** Chat bodies carry `**bold**` markers — strip them for one-line previews. */
export function previewText(body: string): string {
  return body.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

type NotificationsState = {
  /** Newest first, incoming messages only (never my own). */
  items: ChatNotification[];
  unreadCount: number;
  /** Currently on screen as a popup. */
  toasts: ChatNotification[];
  isUnread: (n: ChatNotification) => boolean;
  dismissToast: (id: string) => void;
  /** Optimistic local clear — the DB write happens when /chatt opens the thread. */
  markConversationRead: (conversationId: string) => void;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsState | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const selfId = user?.id ?? "";

  const [items, setItems] = useState<ChatNotification[]>([]);
  const [toasts, setToasts] = useState<ChatNotification[]>([]);
  const [lastRead, setLastRead] = useState<Record<string, string | null>>({});

  const convsRef = useRef<Map<string, ConvLite>>(new Map());
  const peopleRef = useRef<Map<string, PersonLite>>(new Map());
  const seenRef = useRef<Set<string>>(new Set());

  // Don't pop a toast for the thread the user is already looking at.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchConv = useRouterState({
    select: (s) => (s.location.search as { c?: string })?.c ?? null,
  });
  const activeConvRef = useRef<string | null>(null);
  activeConvRef.current = pathname === "/chatt" ? searchConv : null;

  const applyContext = useCallback((ctx: ChatContext) => {
    convsRef.current = ctx.convs;
    peopleRef.current = ctx.people;
    setLastRead(ctx.lastRead);
  }, []);

  useEffect(() => {
    if (!selfId) {
      convsRef.current = new Map();
      peopleRef.current = new Map();
      seenRef.current = new Set();
      setItems([]);
      setToasts([]);
      setLastRead({});
      return;
    }
    let cancelled = false;
    loadChatContext(selfId)
      .then((ctx) => {
        if (cancelled) return;
        applyContext(ctx);
        const built = ctx.messages.map((m) => buildNotification(m, ctx.convs, ctx.people));
        built.forEach((n) => seenRef.current.add(n.id));
        setItems(built);
      })
      .catch(() => {
        /* A failed backfill just means an empty bell — live messages still arrive. */
      });
    return () => {
      cancelled = true;
    };
  }, [selfId, applyContext]);

  const pushMessage = useCallback(
    async (row: MessageRow) => {
      if (!selfId || !row?.id) return;
      if (row.sender_id === selfId || row.deleted_at) return;
      if (seenRef.current.has(row.id)) return;

      // A conversation created after mount isn't in the map yet — refetch once,
      // and treat "still unknown" as "not mine" rather than notifying blindly.
      if (!convsRef.current.has(row.conversation_id)) {
        const ctx = await loadChatContext(selfId).catch(() => null);
        if (!ctx) return;
        applyContext(ctx);
        if (!convsRef.current.has(row.conversation_id)) return;
      }
      if (!peopleRef.current.has(row.sender_id)) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", row.sender_id)
          .maybeSingle();
        if (data) peopleRef.current.set(data.id as string, data as PersonLite);
      }

      seenRef.current.add(row.id);
      const n = buildNotification(row, convsRef.current, peopleRef.current);
      setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, MAX_ITEMS));
      if (activeConvRef.current !== row.conversation_id) {
        setToasts((prev) => [...prev.filter((x) => x.id !== n.id), n].slice(-MAX_TOASTS));
      }
    },
    [selfId, applyContext],
  );

  const removeMessage = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    if (!selfId) return;
    const channel = supabase
      .channel(`bayt-notifications-${selfId}`)
      // No filter: RLS already limits realtime rows to conversations I'm in.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          void pushMessage(payload.new as MessageRow);
        },
      )
      // Sender tombstoned it — pull the notification back.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as MessageRow;
          if (row?.deleted_at && row.id) removeMessage(row.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          const old = payload.old as Partial<MessageRow>;
          if (old?.id) removeMessage(old.id);
        },
      )
      // Reading the thread anywhere (incl. another tab) clears the badge here.
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_participants",
          filter: `profile_id=eq.${selfId}`,
        },
        (payload) => {
          const row = payload.new as { conversation_id: string; last_read_at: string | null };
          if (row?.conversation_id) {
            setLastRead((prev) => ({ ...prev, [row.conversation_id]: row.last_read_at }));
          }
        },
      )
      // Added to a new conversation — learn its participants before its first message.
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_participants",
          filter: `profile_id=eq.${selfId}`,
        },
        () => {
          void loadChatContext(selfId)
            .then(applyContext)
            .catch(() => {});
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selfId, pushMessage, removeMessage, applyContext]);

  const isUnread = useCallback(
    (n: ChatNotification) => {
      const read = lastRead[n.conversationId];
      return !read || n.createdAt > read;
    },
    [lastRead],
  );

  const markConversationRead = useCallback((conversationId: string) => {
    setLastRead((prev) => ({ ...prev, [conversationId]: new Date().toISOString() }));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!selfId) return;
    const now = new Date().toISOString();
    setLastRead((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = now;
      for (const n of items) next[n.conversationId] = now;
      return next;
    });
    await supabase.from("chat_participants").update({ last_read_at: now }).eq("profile_id", selfId);
  }, [selfId, items]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const unreadCount = useMemo(() => items.filter(isUnread).length, [items, isUnread]);

  const value = useMemo<NotificationsState>(
    () => ({
      items,
      unreadCount,
      toasts,
      isUnread,
      dismissToast,
      markConversationRead,
      markAllRead,
    }),
    [items, unreadCount, toasts, isUnread, dismissToast, markConversationRead, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsState {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
