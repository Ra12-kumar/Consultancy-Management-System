# College directory and college finder

The public directory (`/colleges`) lists universities, colleges and standalone institutions, with server-side search and filters. This page explains:
- where the data comes from;
- what is covered and what is not;
- how imports work;
- how to keep the data current.

## Data sources (verified October 2026)

| Source | What it gives | How we get it | Used |
|---|---|---|---|
| **AISHE** (All India Survey on Higher Education, Ministry of Education) | The three "AISHE Dashboard" lists: all colleges, all universities, all standalone institutions. Each lists the AISHE code, name, state, district and (depending on the list) type, management, year of establishment, location and affiliating university. | An admin signs in at [aikosh.indiaai.gov.in](https://aikosh.indiaai.gov.in) (free MeriPehchaan sign-in), downloads the `.xlsx` files, and uploads them under **Admin → College data**. Licence: Open Government License – India. | **Yes**: three importers, `aishe-colleges`, `aishe-universities` and `aishe-standalone`. |
| AISHE HE directory site (dashboard.aishe.gov.in) | The same institutions, browsed interactively | No documented public API; pages sit behind a CAPTCHA | No. We never scrape it or bypass the CAPTCHA. |
| UGC, AICTE, NIRF, NAAC | Approval lists, rankings, accreditation | No bulk open-licence download with a stable format was found | No. Approvals and accreditation are entered by admins from the official documents, with a source link. |
| College websites and prospectuses | Courses, fees, eligibility | Manual | Fees are entered by admins with `pricing.manage`. Each fee needs a source reference and a verification date before it can be published. |

**No source provides courses or fees in bulk.** Imported institutions are therefore published as **basic listings**, labelled "Basic listing – courses and fees not yet verified". They become detailed listings once an admin adds courses. They show a fee only once an admin publishes a verified fee.

## Coverage, as the product states it
- The directory never claims to list every institution in India.
- `GET /api/colleges/filters` and every search response (`meta.coverage`) return the coverage figures:
  - the number of published institutions, by category;
  - the sources, with the last sync date;
  - states covered, out of 36;
  - the number of institutions with verified fees.
- `partial` stays `true` until all three AISHE lists have been imported successfully. While it is true, the page says "Not every institution in India is listed yet".
- **Current status:** none of the AISHE files has been imported yet, so the directory holds only hand-entered and sample colleges. After the import, record the counts here: file name, data date, rows imported, rows rejected, and any states with gaps.

## Importing
1. **Get the files.** Download the three `.xlsx` files from AIKosh (search "AISHE Dashboard").
2. **Upload.** In **Admin → College data → Imports**:
   - choose the matching data source;
   - optionally enter the source's data date;
   - leave "complete list" ticked for a full download.

   The server checks the file type and columns before queueing (`415 UNSUPPORTED_FILE`, `422 MISSING_COLUMNS`). Files are stored privately (`storage/…/imports`, mode 0600) with their SHA-256 hash.
3. **The job runs in the background.**
   - Only one import runs at a time, guarded by a unique lock index.
   - Rows are read in batches of 500, with a checkpoint after each batch.
   - Each row is validated:
     - AISHE code format, and a prefix that matches the list (`C-`, `U-`, `S-`);
     - name;
     - a state or UT recognised from the 36 names, with known aliases.
   - Invalid rows are rejected and reported with their spreadsheet row number. The first 200 are kept on the job.
4. **Matching** uses the **AISHE code**.
   - **New code, no lookalike:** inserted and published as a basic listing.
   - **New code, but a record without a code has the same normalised name and state:** inserted with status `needs_review` (not public), plus a *possible duplicate* item in the review queue.
   - **Existing code:** changed fields are updated.
     - A field an admin has edited is in `lockedFields`. It is never overwritten. Instead the import creates a *field conflict* item with both values.
     - Unchanged records only get `source.lastSeenAt` updated.
   - The same code twice in one file: the first row is kept and the rest are reported.
5. **Nothing is ever deleted.** If an import fails, already-written batches stay. **Retry** continues from the last checkpoint. A server restart marks running jobs `interrupted` so they can be retried.
6. **Change alert.** Admins with `catalog.manage` get an email if an import fails, or if it changes more than 5% of the rows it read.

After the first real import, remove the sample colleges with `npm run seed:remove-samples`.

## Freshness
- **Not in source.** Records missing from the latest *complete* import of their source are flagged "May be out of date". They are listed under **Stale records**, and admins decide what to do.
- **Verification due.** Detailed records verified more than 365 days ago are flagged the same way.
- **Source dates.** Every imported record shows its source, the date its details were last updated from the source, and the date it was last seen there.

## Search and budget rules
- **Server-side only.** All filters run in MongoDB on the server: name, alias, AISHE code, place or course; course; region or city; state → district; ownership; category; type; approval or accreditation; scholarships; hostel; intake; percentage.
- **Fee basis.**
  - **Whole course**: `officialTotalMinor`.
  - **Per year**: `annualOfficialMinor`, which is per-year components plus twice per-semester components.
  - A fee charged only as a one-time or whole-course amount has **no annual figure**. It is "not comparable" on the per-year basis and never matches an annual budget.
- **Strict budgets.** Only colleges with a verified, published fee on the chosen basis match.
- **Including unverified fees.** "Also show colleges without verified fees" (`includeUnverified=yes`) adds colleges that have no comparable fee, labelled "Fee not verified". A college whose verified fee is over budget is never shown.
- **Missing fees** are never treated as zero. Estimated totals are never shown as official fees.
- **Caching.** Filter options, district lists and coverage are cached in memory for 5 minutes, and cleared after every import, review decision and admin edit.

## Known gaps
- No courses, fees, intake, contact details, websites or PIN codes come from AISHE. These need manual verification.
- The AISHE column names can change between releases. The importers match a list of header aliases, and an unknown layout is refused with the missing columns named. Update `backend/src/services/directory/importers.ts` if the layout changes.
- Districts are taken as written in the source. Spelling variants of the same district appear as separate entries until the source corrects them.
- Duplicate detection compares the normalised name and state of records without an AISHE code. It does not catch renamed institutions.
- NIRF ranks, NAAC grades and AICTE or UGC approvals are not imported. No licensed bulk source was found.

## API
See `docs/api.md` ("Catalogue" and "College data administration").

## CollegeDB name search (third-party)

The directory page also shows up to five name matches from **CollegeDB** (https://docs.collegedb.in, by eLitmus), in a separate panel labelled "Third-party data – not verified by us".

**What the provider offers.** Verified against the docs and live requests on 28 October 2026:

| Endpoint | Returns |
|---|---|
| `GET https://api.collegedb.in/v1/colleges/search?q=` | `{ results: [{ id (UUID), name, city, state }], query }`. `q` must be at least 2 characters. It returns at most 5 results, ranked by relevance, matching aliases too. There is **no pagination and there are no filters** (no state, city, course, ownership or fee parameters). |
| `GET https://api.collegedb.in/v1/colleges/:id` | `{ id, name, aliases[], city, state, type, createdAt, updatedAt }`. The documented types are `institute_of_technology`, `national_institute`, `institute_of_science`, `deemed_university`, `state_university`, `private_university`, `autonomous_college` and `unknown`. |

- **Authentication:** `Authorization: Bearer cdb_…`, or the `X-API-Key` header.
- **Errors:** 400 for a bad query, 401 for a missing or invalid key, 403 for a revoked key, 404, 429 for an exhausted quota, and 500.
- **Quota:** a daily quota per key, which resets at midnight UTC. The docs list Free as 50 a day, Starter as 5,000 a day for $49/month, and Pro as 50,000 a day for $199/month. **The live free key reports 30 a day** (`X-RateLimit-Limit: 30`).
- **Not provided:** fees, courses, ownership, websites, approvals and rankings. Storage, caching and licensing terms are **not stated**.

**How we use it** (`backend/src/services/collegeDb.service.ts`):
- **Our endpoints:**
  - `GET /api/colleges/search?q=` takes 2–80 characters and nothing else.
  - `GET /api/colleges/external/:id` takes a UUID.
  - Both are rate limited to 30 calls per IP per 10 minutes.
  - The browser never sees the key.
- **One host only:** the service calls only `https://api.collegedb.in`, with an 8-second timeout, and refuses redirects. The only user input passed on is the URL-encoded query.
- **Caching:** answers are kept **in memory only** (search 6 hours, lookup 24 hours, at most 500 entries). Identical concurrent searches share one call. Nothing from CollegeDB is stored in MongoDB, because the terms don't say storage is allowed. Each answer shows whether it was cached and when it was fetched.
- **Quota handling:**
  - When `X-RateLimit-Remaining` reaches 0, or the provider answers 429, no more calls are made until midnight UTC.
  - Students see "reached its daily limit"; the error code is `COLLEGEDB_QUOTA_EXHAUSTED`.
  - Our own directory search keeps working.
- **Other errors:** a 401 or 403 becomes a generic 503 (`COLLEGEDB_UNAVAILABLE`). A 5xx, a timeout or invalid JSON becomes a 502. Provider messages, keys and headers are never returned or logged.
- **Without a key:** if `COLLEGEDB_API_KEY` is empty, the panel is hidden and the endpoints answer 503 `COLLEGEDB_NOT_CONFIGURED`.
- **Fees:** each result is matched to a published college in our directory by normalised name and state. "View in our directory" and "Verified fees in our directory" appear only for matches. Every other result says "Fee information unavailable" and offers an enquiry. Budgets and fees never come from CollegeDB.

**Configuration.** Set `COLLEGEDB_API_KEY=cdb_…` in the root `.env` (server-side only, never a `NEXT_PUBLIC_` variable), then restart the API. The startup log shows `collegeDbSearch: "enabled"`. Tests and e2e runs force the key empty, so they never spend the quota.

**Limits to keep in mind:**
- With 30 calls a day, the panel serves a handful of new searches daily. Repeated searches come from the cache.
- For real traffic, a paid plan is needed.
