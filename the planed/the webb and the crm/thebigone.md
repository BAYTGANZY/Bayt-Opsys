# THE BIG ONE — Master Feature Specification

**Source:** Full categorization of `the planed/the logs.txt` (a planning conversation between the user and Claude).
**Purpose:** This is not a new plan — it is the existing plan, restructured so every feature, page, rule, and open question is traceable and unambiguous before mockup/build work continues.

---

## 0. What This Project Actually Is

Two systems, one shared database, connected by a single data bridge:

1. **The existing CRM** (Bayt Admin Portal) — already exists, already has its own item register with a "Values/Options/Sub-Options" tree feature. This project did not invent that system; it's reusing it.
2. **A new public-facing website** — a "webshop" that does **not** sell anything or show prices. It lets a customer configure a custom product (e.g. a printed t-shirt with specific size/color/print options) and submit a **quote/price request**, not an order.

The connecting tissue is: **the same Value → Option → Sub-Option → Sub-Sub-Option tree schema is used on both sides.** The website is essentially a customer-facing "front door" that produces CRM offer rows shaped exactly like the CRM's own item register, with zero translation layer.

The single core user action the whole system exists to support:
> Get a customer to submit a price request, configured exactly the way the shop owner wants it presented, without the customer ever seeing a price or feeling like they've "bought" anything — and land that request in the CRM in a format staff can price immediately.

Three roles:
- **Admin** — full access (product catalog, categories, forms, pricing, CRM).
- **Staff** — product catalog access only (can build/edit products, presumably not full CRM/admin settings).
- **Customer** — public visitor → becomes an authenticated account holder after checkout, tied to one account per organization number.

---

## 1. The Core Feature: The Value/Option/Sub-Option/Sub-Sub-Option Tree

This is the single most important — and most heavily discussed — piece of the entire system. It appears in two places (CRM and website) as **one identical underlying schema**, differing only in how it's rendered.

### 1.1 Structure (identical on both sides)

- **4 levels of depth, maximum:**
  - Level 1: **Value** — free-text label (e.g. "Size", "Color", "Print placement" — these are just examples, not the actual fixed schema)
  - Level 2: **Option** — scoped only to its parent Value
  - Level 3: **Sub-Option** — scoped only to its parent Option
  - Level 4: **Sub-Sub-Option** — scoped only to its parent Sub-Option
- **Unlimited width at every level.** The 4-level cap is on *depth only* — a Value can have 100 Options, an Option can have 100 Sub-Options, etc.
- **No cross-linking between branches.** Two Values on the same item (e.g. "Color" and "Size") share nothing, even structurally.
- **Everything is strictly parent-scoped.** Values belong to the item/product; Options belong to their Value; Sub-Options to their Option; Sub-Sub-Options to their Sub-Option.
- **Every node at every level must persist in the database.** This is a hard requirement, not an optimization detail.

### 1.2 The addition that makes the website version different from the CRM version

The **only structural difference** between the CRM's existing tree feature and the new website product builder:

> On the website, **each node at any level** can be marked by the admin as either:
> - **Pickable (button)** — the customer sees this as a clickable option they select, or
> - **Non-pickable (text/label)** — this node is just a label/description, not something the customer clicks.

This toggle can be set independently **at every layer**, not just at the Value level. Example given in the log: Value could render as a plain text label ("Size"), while the Options under it render as buttons (Small/Medium/Large) — or any other combination of button/text across the four layers, per node.

Each node, regardless of level, also supports:
- A **name** (free text, admin-defined)
- The **button-or-text display setting**
- Optional **description text** attached to the node (as much as needed)
- Unlimited siblings at that level

**Explicitly rejected interpretation (corrected mid-conversation):** the customer can never free-type a custom value. "Text" display mode is purely a *visual* choice by the admin (show this node as a text label instead of a button-shaped button) — it is never a customer-editable text input. Customers only ever select from what the admin pre-built.

### 1.3 How a product actually gets configured (customer flow example, generalized)

The example used repeatedly (t-shirt/print business) — treat these specific words as illustrative, not literal spec:
- Value: "Size" → admin sets display as text label (not a button itself) → Options under it: Small / Medium / Large, set as pickable buttons.
- Value: "Print" → Options: Front & Back / Left & Right / Only Front / Only Back, set as pickable buttons.
- Once an Option is picked, it can have its own Sub-Options (another full layer of admin-defined, possibly-pickable nodes) — e.g. picking "Front & Back" reveals Sub-Options for further refinement (like a color selection scoped only to that path).
- The customer never sees the *whole* tree at once in the sense that matters for data transfer — see 1.4.

### 1.4 The Data Bridge — how the tree crosses from website to CRM (this is "the data bridge" from earlier open items, now LOCKED)

This was the single most iterated-on point in the whole conversation. Final locked behavior:

- The **admin product builder on the website builds the full tree** (all Values, all Options, all Sub-Options, all Sub-Sub-Options, with pickable/non-pickable flags) — and this is saved against the product's **article number**.
- The **customer only ever selects one path per Value** — i.e., for each Value, they pick their way down through Option → Sub-Option → Sub-Sub-Option, but only one branch per Value.
- **On submission, only the selected path is transferred** — not the full tree. Every unselected sibling at every level is stripped out entirely. What lands in the CRM offer row is a clean, minimal string per Value showing just the exact selected chain (e.g. "Color → Yellow", not "Color → Yellow, Green, Red, White").
- **In the CRM, the exact same schema/record is read**, just rendered differently: no buttons, plain text, showing only the selected path. This is emphasized as critical: **it is the same underlying record on both sides, not two synced copies.** There is nothing to "keep in sync" because there's only one tree — the website and CRM are just two different rendering modes (interactive buttons vs. read-only text) over the same data.
- This design is explicitly called out as solving the "fragility" problem discussed later (see Section 6) — because there's one schema and one record, not two systems that could drift apart.
- Pricing is then applied by staff to the **entire line item** (the full product + its selected path, as one unit), not per individual sub-option. See Section 4 for full pricing flow.

### 1.5 Still open on this feature
- The precise **admin authoring UI/interaction pattern** for building this tree (linear form vs. live visual tree vs. drag-reorder vs. copy-from-another-product) was discussed as a question but never fully resolved into a UI spec — only the *data behavior* was locked. This remains a UI/UX design task, not a data-model task.
- The **"unsolved design problem"** flagged from the CRM's original notes — how to make a 4-level tree *feel* native in the interface rather than like an exposed recursive dev-tool/file-directory — is still explicitly unsolved. This applies to both the CRM's existing tree UI and the new website builder's tree UI.

---

## 2. Public Website — Page-by-Page Specification

### 2.1 Homepage — LOCKED
- Full-screen, **non-scrollable** on load.
- **9 category columns** displayed edge-to-edge.
- Clicking a category triggers an animation where that column expands to fill the screen, then the page scrolls into that category's content.
- The 9 categories are fixed top-level categories (example names mentioned: BILDEKOR, PROFILKLÄDER, etc. — these are illustrative category names from the business domain, likely real but treat as example unless confirmed against current admin data).

### 2.2 Category Page — LOCKED (evolved twice during the conversation)
- **Hero text + single CTA** ("Se våra produkter") leading into a product grid below.
- **Category hierarchy is now hierarchical**, not flat: each of the 9 main categories can have admin-defined **subcategories** (example: PROFILKLÄDER → T-shirts, Hoodies, Hats, Jackets).
  - A product is assigned to a subcategory, which automatically ties it to the parent category too.
  - **Still open:** whether a product can belong to *multiple* subcategories under the same parent, or strictly one subcategory per product. (Unresolved as of end of log.)
- **Sticky left sidebar** shows this subcategory hierarchy as a long vertical bar spanning the first screen frame; it scrolls with the user so it's always accessible while browsing the product grid. This was explicitly requested for "quick accessibility" so users always know where they are / what else exists.
- Clicking a subcategory in the sidebar filters the product grid below to just that subcategory.
- **Contact form lives on the category page** — locked earlier, then reconfirmed later in the log: submissions from this form do **not** go into the orders/quote table. They land in a **separate CRM subpage** for form submissions, tagged with source category, question, and answer. (See Section 5 for contact form / admin form builder detail.)
- Contact form supports **3 question types**: textbox, dropdown (admin-defined options), checkbox (admin-defined options).

### 2.3 Product Detail Page — LOCKED
Three distinct sections, explicitly enumerated and locked late in the log:
1. **Media & description** — carousel-style images + descriptive text. **No reviews** (explicitly rejected).
2. **Option picker** — the Value/Option/Sub-Option/Sub-Sub-Option tree (Section 1), rendered as the admin configured it (buttons/text per node), customer clicks through their path.
3. **Offer request** — a checkout-style button/form that submits the configuration as a quote request into the CRM.

Additional locked rules for this page:
- Every product listing shows: **item name, article number, and the Value tree path** (this triple — name / article number / selected tree path — is described explicitly as *the actual bridge mechanism itself*, i.e., this exact shape is what flows into the CRM).
- **2-hour cancellation window**: once submitted, the customer can retract/cancel the quote request within 2 hours. This is a post-submission retraction, **not** a draft-save.
- **Closing the tab before hitting Submit means the request never goes through at all** — there is no autosave/draft persistence pre-submission (explicitly confirmed, and the user rejected exploring an alternative — "let's just keep it that way the way it was").
- Submission happens **immediately** on clicking Submit and lands in the CRM right away; closing the tab afterward does not undo it (only the 2-hour window does).

### 2.4 Basket — LOCKED
- Combines items across **multiple categories** into a single basket.
- Regardless of how many categories/products are in the basket, it becomes **one single combined quote request row** in the CRM `orders` table, with status `not_started`.

### 2.5 Checkout — LOCKED (3 steps, finalized after back-and-forth)
The step count and order flip-flopped during the conversation (2 steps → discussion of 3–4 → settled at 3). **Final locked version:**

- **Step 1 — Customer/business information form.** Collects:
  - Name
  - Business name
  - Organization number
  - Address
  - Town
  - City
  - Country
  - Phone
  - Email
  - Organization number is the **key** tying this request to CRM business history (see 2.5.1 below).
- **Step 2 — Order review.** Customer sees everything in their basket: all products, all selected option paths, quantities. Full basket review before committing — described as "the bait before the big leap."
- **Step 3 — Signup/login ("the big leap").** Customer creates an account or logs in with email; this creates or ties to their customer account in the system.

**Note on the log's internal inconsistency:** earlier in the conversation the user described this in the opposite order (basket review first, then info, then signup) and even second-guessed which order was intended ("check step one is done... let's go to step two... the display of products"). The **final explicit locked version**, stated plainly and unchallenged, is **Info → Review → Signup**, as listed above. Treat that as authoritative; flag to the user if this ordering needs re-confirming before build, since the log shows genuine hesitation here.

#### 2.5.1 Organization number as the CRM linking key — LOCKED
- If the organization number entered already exists in the CRM, the new quote request is tied to that existing business record.
- If it does not exist, a new business record is created in the CRM with that org number + business name, and the quote request ties to the new record.
- Either way, the quote request always lands in the CRM linked to an organization number.
- **Still open:** the exact validation UX — real-time lookup as they type, on blur, after clicking Next, or only at final submit. Not specified.

#### 2.5.2 Abandoned checkout — STILL OPEN
- Explicitly listed as unresolved at the end of the log: if a customer closes the tab mid-checkout (after starting but before finishing signup), does the system save their basket/progress for return, or does it reset to nothing? No decision recorded.

### 2.6 Post-Signup Customer Dashboard — LOCKED (structure), sidebar navigation STILL OPEN

**Top section — Timeline/pipeline**, 5 sequential dots pulled from (or mirroring) CRM pipeline stages:
1. **Sent** (green/active immediately on signup — indicates quote request submitted)
2. **Received** (greyed out until CRM staff acknowledges it)
3. **Price estimate** (greyed out until staff prices it)
4. **Production** (greyed out until item is being made)
5. **Delivery** (greyed out until item is being delivered)

Note: earlier in the log only 3 dots were proposed (Sent/Received/Price estimate); the user then explicitly added Production and Delivery as dots 4 and 5, locking it at 5 total. Pipeline stages themselves are confirmed elsewhere in the log as **pulled directly from the existing CRM's pipeline**, not reinvented for this feature — so dot labels/stage definitions should match whatever pipeline stages already exist in the CRM, not be treated as a new independent 5-stage system unless the CRM's stages happen to already be these 5.

**Below the timeline — Order summary:**
- All products in the basket that generated this dashboard entry
- The exact selected option tree path per product (not the full tree)
- Quantities
- **No price shown initially** (nothing to show until staff sets one)
- Once staff prices a line item in the CRM, price displays back per line item, in this exact shape: `Product name (article number) — [selected path] — Price: X SEK`. Pricing is **per line item as a whole**, not per individual sub-option (explicitly locked: "they price the entire line item... not individual sub-options").

**Bottom:** button to continue shopping / return to categories.

**Explicitly flagged as unfinished by the user themselves:** the dashboard **sidebar navigation** — how a logged-in customer moves between their orders list, order history/log, and profile/business settings — has "groundwork" but was never specced in detail. This is confirmed as customer-only, visible only after login, never shown to anonymous visitors.

### 2.7 Blog — LOCKED
- Listing page + individual post page.
- Filterable by category.
- One post can be tagged to multiple categories.
- Related posts surface on category pages.

### 2.8 Header / Footer / Navbar — LOCKED (kept intentionally simple; user pushed back on over-specifying this)
- **Header/navbar** is public, site-wide (not the customer dashboard sidebar, which is separate and login-only).
  - Main pages: e.g. Om oss (About), Blog, Kontakta oss (Contact) — standard pattern, not exhaustively fixed.
  - Login/Register button top-right for anonymous visitors; switches to an account menu once logged in.
- **Footer**: same page links, plus address, phone, copyright, legal links — standard pattern.
- The user explicitly characterized this as "common UI principles," not a deep planning question — so treat this as a loose convention to follow rather than a pixel-exact spec.

### 2.9 SEO/CMS — LOCKED
- Positional, editable text blocks across every public page.
- Lorem ipsum placeholder content until admin fills them in via CMS.

### 2.10 Sitemap — LOCKED
- Every public, customer, and admin URL is named (per the log; the actual URL list itself isn't reproduced in this excerpt of the log — check the original planning session/artifact for the literal sitemap if it exists separately).

---

## 3. Admin / Staff Side (CRM + Website Admin Panel)

### 3.1 Admin Product Builder — LOCKED (data/behavior), UI interaction pattern STILL OPEN
- Staff/admin build the product's full Value/Option/Sub-Option/Sub-Sub-Option tree, identical schema to the CRM's own tree feature, with the added pickable/non-pickable (button/text) toggle at every node (see Section 1.2).
- Tree is saved against the product's **article number**.
- Admin sees the tree "build live" as they add nodes (stated as locked), but the literal interaction mechanics (linear form that builds a tree behind the scenes vs. a live visual tree vs. drag-and-drop vs. copy-Value-from-another-product) were raised as explicit open questions and **never resolved** — only the end *result* (a live-building tree with per-node toggles) is locked, not the *how*.
- This is the same page/concept as "the option-board builder" referenced at the very start of the log.

### 3.2 Category / Subcategory Management — PARTIALLY LOCKED
- Admin can create and manage subcategories under each of the 9 main categories.
- **Still open:** how staff actually assign a product to a category/subcategory in the UI (dropdown, search, tree selector) — mentioned as an open item but not resolved in this log.
- **Still open:** single vs. multiple subcategory membership per product (see 2.2).

### 3.3 Contact Form Submissions (Admin/CRM view) — LOCKED
- Separate CRM subpage (not the orders/quote table).
- Shows: source category, question, answer.
- Form questions support 3 types: textbox, dropdown (admin-defined options), checkbox (admin-defined options).
- **Admin form builder UI** (how staff visually create/reorder/mark-required these questions per category) is explicitly listed as still unresolved at the very end of the log — one of the last 3 open items.

### 3.4 Staff Pricing Workflow in the CRM — LOCKED
- When a quote request/offer row arrives from the website, staff open it and see: article number, product name, and **only the customer's selected path** through the tree per Value (full tree is not shown/exposed — everything unselected is stripped at transfer time, per Section 1.4).
- Staff price the **entire line item as one unit** (not per sub-option, not per individual node).
- That price is written back and displayed on the customer's dashboard in the exact format shown in Section 2.6.
- **Not specified in detail:** the literal input UI for entering that price (a field per row, a modal, inline edit, etc.) — behaviorally locked, visually unspecified.

### 3.5 Roles — LOCKED
- **Admin**: full access.
- **Staff**: product catalog access only.
- **Customer**: the public/dashboard-only role described throughout Section 2.
- One account per organization number, tied to the CRM's org number field (see 2.5.1).

---

## 4. Full Data Flow, End to End (canonical restatement)

This sequence is the single clearest "locked" description of the entire system's core mechanic, reconstructed from the final iterations of the log:

1. **Admin (website product builder)** creates a product: article number + full Value→Option→Sub-Option→Sub-Sub-Option tree, with each node marked pickable (button) or non-pickable (text/label), plus optional description text per node.
2. **Customer (website)** opens the product detail page, sees the tree rendered per the admin's button/text settings, and clicks through exactly one path per Value.
3. **Customer submits** via the offer-request button. Only the *selected path* per Value is retained; every unselected sibling at every level is discarded at the point of transfer — nothing else in the tree is sent.
4. This selected-path payload — bundled with article number and product name — becomes (with everything else in the basket) **one combined quote request row** in the CRM `orders` table, status `not_started`.
5. During checkout, the customer's **organization number** links this request to an existing or newly-created CRM business record (Section 2.5.1).
6. **Staff (CRM)** open the offer row: see article number, product name, and the clean selected-path string per Value (same underlying tree record, rendered as plain text instead of buttons — not a separate synced copy).
7. **Staff price the entire line item** as one number.
8. That price **writes back** to the customer's dashboard, displayed per line item as: `Product (article #) — [selected path] — Price: X SEK`.
9. The customer can **cancel/retract within 2 hours** of original submission (not before submission — pre-submit tab-close simply means nothing was ever sent).

---

## 5. Locked vs. Open — Consolidated Checklist

### 5.1 Fully LOCKED
- Homepage structure (9 columns, non-scroll, expand animation)
- Category page: hero + CTA + product grid + hierarchical subcategories + sticky scrolling sidebar
- Contact form: on category-adjacent flow, 3 question types, routes to separate CRM subpage (not orders)
- Product detail page: media carousel + text, option-picker tree, offer-request button, no reviews
- 2-hour post-submission cancellation window; no pre-submit draft/autosave
- Basket: cross-category combination into one quote request row, `not_started` status
- Checkout: 3 steps — info (incl. org number) → review → signup/login
- Org number as CRM business-record linking key (create-if-missing behavior)
- Post-signup dashboard: 5-dot timeline (Sent/Received/Price estimate/Production/Delivery) + order summary, no price until staff sets it
- Pricing granularity: per line item (whole product + selected path), not per sub-option
- Pricing display format on dashboard
- The full Value/Option/Sub-Option/Sub-Sub-Option tree: structure, scoping, unlimited width/4-level depth cap, per-node name+display-mode+description
- Data bridge mechanic: same schema both sides, selected-path-only transfer, no sync needed because it's one record
- Blog: listing/detail/filter/multi-tag/related-posts
- CMS: positional editable text blocks, Lorem ipsum placeholder
- Header/footer/navbar: standard pattern, public site-wide, login button state-switch
- Dashboard sidebar: confirmed customer-only/login-gated (existence locked; internal navigation detail not)
- Roles: admin/staff/customer, one account per org number
- Sitemap: exists, fully named (per log claim)
- In-web notifications only; email deferred

### 5.2 STILL OPEN (as of end of log — 3 items explicitly called out as the last blockers before mockup, plus a few others surfaced earlier and not recorded as closed)
1. **Product subcategory assignment** — single subcategory per product, or multiple allowed under the same parent category.
2. **Abandoned checkout** — save basket progress on tab-close mid-checkout, or reset to nothing.
3. **Admin form builder UI** — the actual visual interaction for staff to build/reorder/require category contact form questions.
4. **Admin product builder interaction pattern** — *how* the tree gets authored (linear form vs. live visual tree vs. drag/reorder vs. copy-from-another-product) — data/behavior is locked, authoring UI is not.
5. **Category/product assignment UI** — dropdown, search, or tree-selector for staff assigning a product to a (sub)category.
6. **Org number validation UX** — real-time vs. on-submit lookup.
7. **Existing customer login/return experience** — what a returning customer with prior orders sees on login (mentioned as open, no resolution recorded).
8. **Header/footer exact content** — page list and footer content were treated as "standard pattern, not a real decision" rather than explicitly enumerated; worth a final confirm pass before build, not just before mockup.
9. **Design & branding** — no color palette, typography, logo, or reference site chosen. Explicitly parked as "taste, not function," safe to run in parallel with everything else.
10. **CRM tree node deactivation rule** — see Section 6.1: identified as necessary but not yet confirmed as implemented/enforced at the database level.

---

## 6. Risks Flagged in the Log (worth keeping visible, not just historical color)

### 6.1 The core fragility point — now largely mitigated by the "one shared record" design, but with one unresolved enforcement gap
Because the tree is one single database record read in two rendering modes (not two synced systems), the sync-mismatch risk the user worried about is structurally avoided. **However**, one specific failure mode was identified and only half-solved:

> If a staff member/admin **deletes** a tree node (e.g. removes "Color: Green" because a supplier ran out) that is already referenced by an existing submitted order, the CRM offer row is left pointing at an option that no longer exists — an orphaned reference.

**Proposed fix (stated, not confirmed as built):** never hard-delete a node that's referenced by an existing order — only deactivate/soft-delete it, and **this rule must be enforced at the database level**, not left to admin discipline. This should be treated as a concrete backend requirement, not just a design suggestion, when the schema is implemented.

### 6.2 Complexity/engineering risk on the admin tree builder
Building a live, per-node togglable (pickable/non-pickable), unlimited-width, 4-level-deep tree editor that doesn't feel like a raw dev-tool/file-directory is called out explicitly as a **serious, still-unsolved UI engineering challenge** — flagged as unsolved even in the CRM's original notes, before this website project existed. Do not treat this as a small UI task during implementation planning.

### 6.3 Scope creep
The user's own conversation shows repeated organic scope growth (subcategories → hierarchical nav → sticky sidebar all got added mid-stream, each reasonable alone). Flagged explicitly as a real risk worth monitoring, not a hypothetical.

### 6.4 Presenting to the client with gaps
As of the log's end, 3 (or arguably more, per Section 5.2) items are still open. If a mockup is presented before these are resolved, the client may ask questions (e.g. "how do I as the shop owner build a product with color/size options") that currently have no answer beyond "not yet designed."

---

## 7. Recommended Next Steps (derived from the log's own sequencing logic, not new opinions)

The log itself repeatedly proposed pairing related open items together since they constrain each other. Following that same logic against the *current* open list (Section 5.2):

1. **Close the 3 explicitly-flagged last items first** (subcategory multiplicity, abandoned checkout behavior, admin form builder UI) — these were the user's own stated stopping point right before "we move straight into mockup."
2. **Then resolve the admin product builder's authoring UI** (open item 4) together with the **CRM tree deactivation rule** (open item 10/Section 6.1) — same reasoning the log used earlier for pairing the data bridge with the product builder UI: one is the interaction surface, the other is the database guarantee underneath it, and both touch the same tree feature.
3. **Design/branding** can run in parallel at any point — explicitly deprioritized as "taste, not function" throughout the log.
4. Once the above is closed, the log's own conclusion holds: mockup work can proceed with a functionally complete spec, rather than mocking "the three pages that happen to be fully specced" (the risk called out explicitly in an earlier message in the log).
