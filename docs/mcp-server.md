# Igla Guides MCP server

A read-only MCP (Model Context Protocol) server that lets a support agent —
ChatGPT, Claude, or your own app — search the installation guides and answer
questions from them.

**Endpoint:** `https://<your-app>/api/mcp`
**Auth:** the same service token as `/api/guild/resolve` and `/api/compatibility`.

```bash
npm run token:service
```

---

## What it can reach

| | |
|---|---|
| Guides | **PUBLISHED only.** Drafts and archived guides are invisible, and so are guides flagged *Hide from compatibility list* where that applies. |
| Writes | **None.** Every tool is a read. There is no tool that can create, edit, publish or delete anything. |
| Customer data | **None.** This server sees guides and vehicle compatibility. Dealers, install reports, certificates and VINs live in the portal and are not exposed here. |
| Images | Not served. Photo *captions* and *annotation labels* are indexed as text (often the only words on an installation-point section), but no image bytes or signed URLs are handed out. |
| Audit | Every tool call is written to the audit log (`mcp_tool_call`) and runs through the same alert rules as any other content access — an agent walking the whole corpus looks exactly like the enumeration those rules exist to catch. |

## Tools

| Tool | Use it for |
|---|---|
| `search` | Any installation / wiring / config question. Returns ranked guide sections with excerpts and ids. |
| `fetch` | The full text of one guide, by an id from `search`. |
| `search_guides` | Same as `search` but with `make` / `model` / `year` / `product` filters — better when the vehicle is known. |
| `get_guide` | Full guide by id, as structured sections rather than one blob. |
| `check_compatibility` | "Which Igla unit fits a 2024 Ram 1500?" Same data and same code path the dealer portal uses. |
| `list_vehicles` | "Do you have a guide for X?" |

`search` and `fetch` exist under exactly those names and shapes because that is
the contract OpenAI's connectors expect. The rest are for clients that can call
arbitrary tools.

---

## Connecting

### ChatGPT (connector UI)

ChatGPT's connector settings offer only *no authentication* or full OAuth — it
cannot send a custom `Authorization` header. So use the path-token URL:

```
https://<your-app>/api/mcp/<service-token>
```

Settings → Connectors → Add → paste that URL → No authentication.

> **The URL is the password.** It is stored in that ChatGPT account's settings
> and appears in this app's request logs. Mint a separate token for each place
> you connect it, so any one can be revoked without breaking the others.

### OpenAI Responses API

Here the header works, so use the clean URL:

```json
{
  "model": "gpt-5",
  "tools": [{
    "type": "mcp",
    "server_label": "igla_guides",
    "server_url": "https://<your-app>/api/mcp",
    "headers": { "Authorization": "Bearer <service-token>" },
    "require_approval": "never"
  }],
  "input": "Where does the CAN bus connect on a 2024 Ram 1500?"
}
```

### Claude Code / Claude Desktop

```bash
claude mcp add --transport http igla-guides https://<your-app>/api/mcp \
  --header "Authorization: Bearer <service-token>"
```

### Check it by hand

```bash
curl -s https://<your-app>/api/mcp -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## How retrieval works

`GuideSearchDoc` holds **one row per guide section** — section-level because that
is the unit an agent wants back, not a twelve-page document it has to re-read.

Each row carries the section's flattened text plus the vehicle identity, and
Postgres maintains a weighted `tsvector` over it:

- **A** — make, model, alias names, years
- **B** — guide title, section title, product, generation, trim
- **C** — body

So "RAM 1500 CAN bus" ranks the RAM guide's own sections above a guide that
merely mentions a RAM in passing. Alias names are indexed too, which is why a
search for *Ram 1500* finds the guide filed under *Dodge*.

Full-text search alone is weak at part numbers, wire colours and bare model
names, so a plain substring scan runs as a fallback when ranked search returns
little. There are **no embeddings** — no API key, no per-query cost, nothing to
re-embed when a guide changes. If semantic matching is wanted later, pgvector is
available on the database and this table is the natural place to hang it.

### Staying in sync

The index is a mirror of guide content, rebuilt from the guide — the guide stays
the one source of truth (AGENTS.md #1). It re-syncs automatically on every guide
edit, on publish, and on archive/restore.

Visibility is always resolved from the **live** `Guild` row, never from the
`status` snapshot on the index, so a stale snapshot cannot surface an
unpublished guide.

To rebuild everything (after a bulk import, or if you suspect drift):

```bash
npm run search:reindex
```
