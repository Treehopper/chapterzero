# VocabFirst — implementation notes

`README.md` is the specification. This file says how to run the implementation, what was
verified, and where (and why) the implementation deviates from the spec.

## Run it

```sh
npm install
npx playwright install webkit chromium   # once, for the e2e tests and icon rendering

npm test                 # unit + adapter tests (Vitest)
npm run typecheck        # core against ES2022 only, adapters, svelte-check
npm run dev              # http://localhost:5173 (also on your LAN)
npm run build && npm run preview   # production build with service worker on :4173
npm run e2e              # Playwright: iPhone 15 (WebKit) + @android subset (Pixel 7, Chromium)

npm run build:packs      # rebuild the word packs from the public sources (~550 MB download, ~20 s)
npx tsx tools/build-word-packs/src/fixture.ts   # re-cut the miniature test pack from the packs
tools/fixtures/download-epubs.sh                # public-domain test books for the real-book tests
```

**On an iPhone:** PWA installation needs HTTPS. Either deploy (below) or serve the production
build through an HTTPS tunnel. A plain LAN `http://` address works for trying the UI in Safari,
but not for installing to the home screen.

**GitHub Pages:** `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and deploys
`apps/pwa/dist`. It is ready but has not been run. The word packs (3.8 MB) are committed so
CI does not have to download 550 MB of sources.

The e2e tests can use a miniature word pack: opening the app with `?packs=test` switches that
browser to `/test-packs/` (served by the dev/preview server only, never built), and `?packs=real`
switches back.

## Layout

As in README §10: `packages/core` (pure TypeScript, no DOM: checked by `tsc` with
`lib: ["ES2022"]` and by `architecture.test.ts`), `packages/storage-idb`, `packages/epub-browser`,
`packages/word-packs`, `apps/pwa` (Svelte 5), `tools/build-word-packs`, `fixtures`.

The whole application (core + adapters) runs in a **Web Worker**; the UI calls the
`VocabApp` facade through a small postMessage RPC (`apps/pwa/src/lib/rpc.ts`). Every
call is plain JSON, as §4.2 intends.

## Verified while building (README §13)

| Question | Result |
|---|---|
| Wiktextract field names | Translations are per sense (`senses[].translations[]`) with both `code` and `lang_code`; `form_of` / `alt_of` exist. Some spelling variants have no field, only a gloss ("Commonwealth standard spelling of color."), so the builder parses those too. Sanity check: 50 of 1,000 level-1 words lack German. |
| Pack sizes | 3.76 MB total (words 2.8 MB in 2 chunks, FreeDict 0.3 MB, forms 0.6 MB), far below 10 MB, so `def` is kept for all entries. |
| Rank range | wordfreq's English list only ranks **76,600** Wiktionary lemmas, so level 10 is 45,001–~76,600, not up to 100,000. 75,300 list words, 28,700 of them definition-only, 10,800 flagged as cognates. |
| Forms table | 136,000 rows; the 200-pair fixture (`fixtures/forms-200.tsv`) passes. |
| Analysis speed | WebKit on a Mac: Moby-Dick (215,000 words) analysed in 1.3–1.8 s, Sherlock Holmes in 0.8–1.3 s, pack install 3.5 s. A recent iPhone should stay well under the 20 s target. Not yet measured on a device. |
| Quality on real books (cutoff 8,000) | Moby-Dick: 13,600 distinct words → 4,800 cards, 775 not in the lists, 1,160 names, 132 chapters. Sherlock Holmes: 1,630 cards, 70 not in the lists, 12 stories as chapters. Gulliver's Travels: 1,740 cards, 46 chapters ("Part I · I" …). |
| Calibration | The three fit vectors of §7.8 reproduce exactly. Stability across two real runs needs a person. |

## Deviations from the spec, and why

1. **IndexedDB unit of work.** Dexie cannot keep an IndexedDB transaction alive across
   native `await`s in nested async functions, and in WebKit the core services failed with
   `PrematureCommitError`. `IdbUnitOfWork` therefore reads through a per-call write overlay
   and commits all writes at the end in **one** IndexedDB transaction that is created and
   filled synchronously. Units of work are serialised. The guarantee of §7.4 is unchanged:
   one action = one atomic commit, and a kill loses at most the in-flight action.
2. **EPUB parsing uses htmlparser2, not DOMParser**, because `DOMParser` does not exist in
   Web Workers. The reader also runs in Node, so the real-EPUB tests run there too.
3. **Chapter detection additions** (§7.1 step 3), found on real books:
   - Sections are split at TOC fragment anchors before the chapter rules run. Gutenberg EPUBs
     put ~12 chapters into one file, which left Moby-Dick with 11 "chapters" of 20,000 words.
   - Three-level TOCs (book › part › chapter): the leaves become chapters, titled "Part I · Chapter I".
   - A top-level entry with a single child is a subtitle, not a work ("ETYMOLOGY." › "(Supplied by…)").
   - A short chapter merges into the nearest *story* chapter of its work, skipping front matter.
   - An anchored note block that nothing links to ends the previous note.
   - Extra back-matter titles: `… licence/license`, `Project Gutenberg …`, `Colophon`,
     `Uncopyright`. "List of Illustrations" is front matter. Gutenberg's `pg-header`/`pg-footer`
     boilerplate is dropped as non-book text (B14).
4. **Forms table: marginal spelling variants.** The spec's "smallest rank wins" made `ere`
   resolve to `ear` (Wiktionary: "obsolete form of ear"). A spelling pointer marked
   obsolete/archaic/misspelling/dialectal/rare/nonstandard (or an "alternative" form in the
   lemma's own forms list that the form's entry calls marginal) no longer overrides a form that
   is a lemma in its own right. Inflections and standard spellings keep the spec's rule
   (`bore` → common `bear`, `colour`/`centre`/`defence` → American spelling).
5. **Pack manifest** chunks carry `sha256Json` in addition to `sha256`. Some static servers
   (Vite's preview server, others) send `.json.gz` with `Content-Encoding: gzip`, so the browser
   receives JSON; the installer verifies whichever form arrived.
6. **Small model additions:** `BookLemma.listed` / `.name` (needed to re-run step 9 for B3),
   `Card.edited`, `CardStats.firstReviewedAt` (daily new-card limit),
   `StudySession.graded / unlocks / statistics / studyAhead`, `counters.demoted / removed /
   firstAttempts`. The API adds `books.preview` (live counts while ticking chapters),
   `books.get`, `study.get`, `study.statistics`, `calibration.restart`, `cards.words / counts /
   setStatus` and `appState`.
7. **Start level** = the level whose range contains the cutoff (cutoff 2,000 → level 1, as in
   the §7.8 table).
8. **Preview counts** consider only lemmas that occur in the ticked chapters, so ticking keeps
   `distinct = common + below level + known + cognates + names + cards + not in lists` true.

## Testing notes

- 64 unit/adapter tests (Vitest; IndexedDB via fake-indexeddb) and 35 Playwright tests (plus 2 screenshot captures for visual review, `npx playwright test screens`).
- Headless WebKit in Playwright 1.65 on macOS 26 delivers **mouse** events at wrong
  coordinates, even on a bare page; touch works. The e2e tests therefore tap with the
  touchscreen and swipe with touch-type Pointer Events (what iOS Safari delivers). The iPhone
  profile keeps `isMobile`.
- Headless WebKit also ignores `backface-visibility`, so the card swaps faces with
  `visibility` at the 90° point of the flip, which works in every engine.
- Bugs found by the e2e tests and fixed: lost grades on a fast tap-then-swipe, Svelte state
  proxies that `postMessage` cannot clone, the toast's Undo crashing, a gesture recogniser stuck
  after a lost `pointerup`, a rejected swipe consuming its gesture hint, the mirrored back face,
  the gzip checksum mismatch, and the `PrematureCommitError` above.

## Not done / next

- Not tested on a physical iPhone yet (install, storage persistence, Safari quirks).
- "Could" stories: A4 (other language pairs), E6 (history chart).
- Android PWA: runs in Chromium (the `@android` tests); needs a device pass.
- Native apps: the UI only talks to the worker-hosted `VocabApp`, so a Capacitor shell (or a
  native UI over the same core) can reuse core, packs and storage logic.
