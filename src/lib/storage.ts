import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Supabase Storage rejects object keys containing non-ASCII characters with
 *  "Invalid key" — a Swedish filename like "Skärmbild 2026-07-30.png" kills the
 *  whole upload. NFKD splits å/ä/ö into base letter + combining mark, the marks
 *  are stripped, and anything still outside [A-Za-z0-9._-] becomes "_". The
 *  extension survives the same treatment. Only the STORAGE KEY goes through
 *  this — display names kept in the database stay as the user typed them. */
export function sanitizeStorageName(name: string): string {
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]/g, "_");
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  return (clean(stem) || "fil") + clean(ext);
}

/** Derive { bucket, path } from a stored Supabase public-object URL
 *  (…/storage/v1/object/public/<bucket>/<path>). Returns null for anything
 *  else, e.g. an external link. Paths are percent-decoded so a legacy key with
 *  spaces round-trips into createSignedUrl unchanged. */
export function storagePathFromPublicUrl(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/object\/public\/([^/]+)\/([^?]+)/);
  if (!m) return null;
  let path = m[2];
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the raw path — better a maybe-working key than a crash
  }
  return { bucket: m[1], path };
}

const SIGNED_URL_TTL_S = 3600;

/** The rows store getPublicUrl() links, but the app's buckets are treated as
 *  PRIVATE (every download path here signs its URLs) — so a public link can
 *  render as a broken thumbnail for everyone even when the row exists. This
 *  hook signs every recognizable storage URL in one batch per bucket and
 *  returns a resolver: stored URL in, displayable URL out, falling back to the
 *  stored URL when signing fails (external link, or a genuinely public bucket). */
export function useSignedFileUrls(urls: Array<string | null | undefined>) {
  const wanted = urls.filter((u): u is string => !!u);
  const q = useQuery({
    queryKey: ["signed-file-urls", wanted],
    enabled: wanted.length > 0,
    staleTime: (SIGNED_URL_TTL_S - 600) * 1000,
    queryFn: async () => {
      const byBucket = new Map<string, Array<{ url: string; path: string }>>();
      for (const url of wanted) {
        const parsed = storagePathFromPublicUrl(url);
        if (!parsed) continue;
        const list = byBucket.get(parsed.bucket) ?? [];
        list.push({ url, path: parsed.path });
        byBucket.set(parsed.bucket, list);
      }
      const out: Record<string, string> = {};
      for (const [bucket, items] of byBucket) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrls(items.map((i) => i.path), SIGNED_URL_TTL_S);
        if (error || !data) continue;
        data.forEach((r, i) => {
          if (r?.signedUrl) out[items[i].url] = r.signedUrl;
        });
      }
      return out;
    },
  });
  return (url: string | null | undefined) => (url ? (q.data?.[url] ?? url) : "");
}
