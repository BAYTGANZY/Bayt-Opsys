import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";
import {
  applySort,
  FilterChips,
  FilterRow,
  NONE_KEY,
  SortToggles,
  useListSort,
  type SortAxis,
} from "@/components/ListFilterBar";

export const Route = createFileRoute("/_authenticated/ekonomi")({
  head: () => ({ meta: [{ title: "Ekonomi — BAYT" }] }),
  component: EkonomiPage,
});

const C = {
  bg: "#FFFFFF",
  card: "#ffffff",
  border: "#E5E7EB",
  primary: "#3D8A30",
  primarySoft: "#E8F5E4",
  secondary: "#6B7280",
  text: "#1a1a1a",
  green: "rgba(92,184,74,0.15)",
  red: "#DC2626",
};

const COLOR_BY_NAME: Record<string, string> = {
  Drift: "#1a5c2e",
  Underhåll: "#e07b39",
  Underhall: "#e07b39",
  Investeringar: "#4a6eb5",
  Övrigt: "#9b7fd4",
  Ovrigt: "#9b7fd4",
};

const YEAR = 2026;

type Category = { id: string; name: string; color: string | null };
type Budget = { id: string; property_id: string | null; year: number; total_budget: number | null };
type Item = {
  id: string;
  category_id: string | null;
  description: string | null;
  budgeted_amount: number | null;
  actual_amount: number | null;
  month: number | null;
  year: number | null;
};

type Tab = "oversikt" | "budget" | "utfall" | "investeringar" | "underhall";

const TABS: { id: Tab; label: string }[] = [
  { id: "oversikt", label: "Översikt" },
  { id: "budget", label: "Budget" },
  { id: "utfall", label: "Utfall" },
  { id: "investeringar", label: "Investeringar" },
  { id: "underhall", label: "Underhållsplan" },
];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("sv-SE").format(Math.round(n));
}

function categoryColor(c: Category | undefined): string {
  if (!c) return "#999";
  return c.color || COLOR_BY_NAME[c.name] || "#999";
}

function EkonomiPage() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("oversikt");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const categoriesQ = useQuery({
    queryKey: ["cost_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_categories").select("id, name, color");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const budgetsQ = useQuery({
    queryKey: ["property_budgets", YEAR],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_budgets")
        .select("id, property_id, year, total_budget")
        .eq("year", YEAR);
      if (error) throw error;
      return (data ?? []) as Budget[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["budget_items", YEAR],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_items")
        .select("id, category_id, description, budgeted_amount, actual_amount, month, year")
        .eq("year", YEAR);
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const categories = categoriesQ.data ?? [];
  const items = itemsQ.data ?? [];
  const budgets = budgetsQ.data ?? [];

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const catByName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name.toLowerCase(), c])),
    [categories]
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>Ekonomi</h1>
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            height: 36,
            padding: "0 14px",
            background: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Lägg till post
        </button>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 20,
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                border: "none",
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 600,
                color: active ? C.primary : C.secondary,
                borderBottom: `2px solid ${active ? C.primary : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "oversikt" && (
        <Oversikt budgets={budgets} items={items} categories={categories} catById={catById} />
      )}
      {tab === "budget" && <BudgetTable items={items} catById={catById} groupByCategory />}
      {tab === "utfall" && <BudgetTable items={items} catById={catById} />}
      {tab === "investeringar" && (
        <BudgetTable
          items={items.filter((i) => i.category_id && catById[i.category_id]?.name.toLowerCase() === "investeringar")}
          catById={catById}
        />
      )}
      {tab === "underhall" && (
        <BudgetTable
          items={items.filter((i) => {
            if (!i.category_id) return false;
            const n = catById[i.category_id]?.name.toLowerCase() ?? "";
            return n === "underhåll" || n === "underhall";
          })}
          catById={catById}
        />
      )}

      {drawerOpen && (
        <AddItemDrawer
          categories={categories}
          catByName={catByName}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function Oversikt({
  budgets,
  items,
  categories,
  catById,
}: {
  budgets: Budget[];
  items: Item[];
  categories: Category[];
  catById: Record<string, Category>;
}) {
  const totalBudget = budgets.reduce((s, b) => s + (b.total_budget ?? 0), 0);
  const totalBudgeted = items.reduce((s, i) => s + (i.budgeted_amount ?? 0), 0);
  const totalActual = items.reduce((s, i) => s + (i.actual_amount ?? 0), 0);
  const pct = totalBudgeted > 0 ? Math.min(100, (totalActual / totalBudgeted) * 100) : 0;

  // Breakdown by category (actual)
  const sums: Record<string, number> = {};
  for (const i of items) {
    if (!i.category_id) continue;
    sums[i.category_id] = (sums[i.category_id] ?? 0) + (i.actual_amount ?? 0);
  }
  const slices = categories
    .map((c) => ({ cat: c, value: sums[c.id] ?? 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;

  // Build conic-gradient
  let acc = 0;
  const stops: string[] = [];
  for (const s of slices) {
    const start = (acc / total) * 100;
    acc += s.value;
    const end = (acc / total) * 100;
    stops.push(`${categoryColor(s.cat)} ${start}% ${end}%`);
  }
  const gradient = stops.length ? `conic-gradient(${stops.join(", ")})` : "#eee";

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", maxWidth: 900 }}>
      {/* Total budget */}
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Total budget {YEAR}
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: C.text, marginBottom: 14 }}>
          {fmt(totalBudget)} SEK
        </div>
        <div style={{ height: 10, background: "#eef0f2", borderRadius: 999, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: C.green,
              transition: "width 200ms",
            }}
          />
        </div>
        <div style={{ fontSize: 13, color: C.secondary, marginTop: 8 }}>
          {fmt(totalActual)} SEK förbrukat ({pct.toFixed(0)}%)
        </div>
      </div>

      {/* Kostnadsfördelning */}
      <div style={cardStyle}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>
          Kostnadsfördelning
        </div>
        {slices.length === 0 ? (
          <div style={{ color: C.secondary, fontSize: 14 }}>Inga utfall ännu</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: gradient,
                flexShrink: 0,
              }}
              aria-label="Kostnadsfördelning"
            />
            <div style={{ display: "grid", gap: 8, minWidth: 220 }}>
              {slices.map((s) => {
                const p = ((s.value / total) * 100).toFixed(0);
                return (
                  <div key={s.cat.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: categoryColor(s.cat),
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, fontSize: 14, color: C.text }}>{s.cat.name}</span>
                    <span style={{ fontSize: 14, color: C.secondary, fontWeight: 600 }}>{p}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Budget / Utfall / Differens delar en sorteringsgrupp — exakt en ordnar
// listan åt gången, precis som Namn/Storlek/Uppladdad gör på dokumentfliken.
// Differens finns bara som beräknat värde (budget − utfall), ingen egen
// kolumn i tabellen, så axeln räknar ut den i valueOf i stället för att läsa
// den.
const BUDGET_SORT_AXES: readonly SortAxis[] = [
  { key: "budget", label: "Budget", dirLabel: { desc: "Högst→Lägst", asc: "Lägst→Högst" }, first: "desc" },
  { key: "utfall", label: "Utfall", dirLabel: { desc: "Högst→Lägst", asc: "Lägst→Högst" }, first: "desc" },
  { key: "differens", label: "Differens", dirLabel: { desc: "Högst→Lägst", asc: "Lägst→Högst" }, first: "desc" },
];

function budgetSortValue(i: Item, axis: string): number {
  if (axis === "budget") return i.budgeted_amount ?? 0;
  if (axis === "utfall") return i.actual_amount ?? 0;
  return (i.budgeted_amount ?? 0) - (i.actual_amount ?? 0);
}

function BudgetTable({
  items,
  catById,
  groupByCategory,
}: {
  items: Item[];
  catById: Record<string, Category>;
  groupByCategory?: boolean;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // Ingen förvald axel: en flik utan filter/sortering ska visa exakt den
  // ordning queryn gav (grupperad på kategori för Budget-fliken, annars
  // hämtningsordningen), inte en tyst standardsortering ingen bad om.
  const sort = useListSort(BUDGET_SORT_AXES);

  const categoryName = (i: Item) => (i.category_id ? catById[i.category_id]?.name ?? "Okänd" : "Utan kategori");

  // Bara kategorier som faktiskt förekommer bland raderna den här fliken redan
  // visar — på Investeringar/Underhåll (redan enkategori-scopade av föräldern)
  // kollapsar det till ett enda val, och FilterChips visar då ingenting.
  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      const key = i.category_id ?? NONE_KEY;
      if (!map.has(key)) map.set(key, categoryName(i));
    }
    if (categoryFilter && !map.has(categoryFilter)) map.set(categoryFilter, "Okänd");
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => (a.value === NONE_KEY ? 1 : b.value === NONE_KEY ? -1 : a.label.localeCompare(b.label, "sv")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, categoryFilter, catById]);

  const filteredItems = useMemo(
    () => (categoryFilter ? items.filter((i) => (i.category_id ?? NONE_KEY) === categoryFilter) : items),
    [items, categoryFilter],
  );

  // En aktiv numerisk sortering tar över grupperingen — kategirubrikerna
  // förutsätter att raderna redan ligger i kategoriordning, och en
  // beloppssortering bryter den ordningen med flit.
  const grouped = groupByCategory && !sort.active;
  const rows = grouped
    ? [...filteredItems].sort((a, b) => categoryName(a).localeCompare(categoryName(b), "sv"))
    : applySort(filteredItems, sort, budgetSortValue);

  const isFiltered = categoryFilter !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {(categoryOptions.length > 1 || items.length > 0) && (
        <FilterRow>
          <FilterChips
            options={categoryOptions}
            value={categoryFilter}
            onChange={setCategoryFilter}
            ariaLabel="Filtrera på kategori"
            allLabel="Alla kategorier"
          />
          <SortToggles axes={BUDGET_SORT_AXES} sort={sort} />
        </FilterRow>
      )}
      {rows.length === 0 ? (
        <div style={{ ...cardStyle, color: C.secondary, fontSize: 14 }}>
          {isFiltered ? "Inga poster för det här valet" : "Inga poster ännu"}
        </div>
      ) : (
        <BudgetRows rows={rows} catById={catById} grouped={!!grouped} />
      )}
    </div>
  );
}

function BudgetRows({
  rows,
  catById,
  grouped,
}: {
  rows: Item[];
  catById: Record<string, Category>;
  grouped: boolean;
}) {
  let lastCat: string | null = null;

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Kategori / Post</th>
            <th style={{ ...th, textAlign: "right" }}>Budget</th>
            <th style={{ ...th, textAlign: "right" }}>Utfall</th>
            <th style={{ ...th, textAlign: "right" }}>Differens</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const cat = i.category_id ? catById[i.category_id] : undefined;
            const budget = i.budgeted_amount ?? 0;
            const actual = i.actual_amount ?? 0;
            const diff = budget - actual;
            const showHeader = grouped && (cat?.name ?? "—") !== lastCat;
            if (showHeader) lastCat = cat?.name ?? "—";
            return (
              <tr key={i.id}>
                <td style={td}>
                  {showHeader && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: categoryColor(cat),
                        }}
                      />
                      <span style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>
                        {cat?.name ?? "—"}
                      </span>
                    </div>
                  )}
                  <div style={{ paddingLeft: showHeader ? 18 : 0, color: C.text, fontSize: 14 }}>
                    {i.description ?? "—"}
                    {i.month ? ` · ${i.month}/${i.year ?? YEAR}` : ""}
                  </div>
                  {!grouped && cat && (
                    <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>{cat.name}</div>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{fmt(budget)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmt(actual)}</td>
                <td
                  style={{
                    ...td,
                    textAlign: "right",
                    color: diff >= 0 ? C.green : C.red,
                    fontWeight: 600,
                  }}
                >
                  {diff >= 0 ? "+" : ""}
                  {fmt(diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddItemDrawer({
  categories,
  catByName,
  onClose,
}: {
  categories: Category[];
  catByName: Record<string, Category>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  void user;
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [budgeted, setBudgeted] = useState("");
  const [month, setMonth] = useState<string>("");
  void catByName;

  const save = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("Välj kategori");
      const { error } = await supabase.from("budget_items").insert({
        category_id: categoryId,
        description: description || null,
        budgeted_amount: budgeted ? Number(budgeted) : null,
        month: month ? Number(month) : null,
        year: YEAR,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget_items"] });
      toast.success("Post tillagd", { style: { background: C.primary, color: "#fff" } });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Kunde inte spara"),
  });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: C.card,
          height: "100%",
          padding: 24,
          overflowY: "auto",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ny budgetpost</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.secondary }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Kategori">
            <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Välj…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Beskrivning">
            <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Budgeterat belopp (SEK)">
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={budgeted}
              onChange={(e) => setBudgeted(e.target.value)}
            />
          </Field>
          <Field label="Månad (1–12)">
            <input
              style={inputStyle}
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>

          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            style={{
              height: 44,
              background: C.primary,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 15,
              fontWeight: 600,
              cursor: save.isPending ? "not-allowed" : "pointer",
              marginTop: 8,
            }}
          >
            {save.isPending ? "Sparar…" : "Spara post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 20,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 600,
  color: C.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: `1px solid ${C.border}`,
  background: "#fafbfc",
};

const td: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 14,
  color: C.text,
  borderBottom: `1px solid ${C.border}`,
  verticalAlign: "top",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
};
