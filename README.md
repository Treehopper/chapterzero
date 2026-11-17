# VocabFirst – learn a book's rare words before you read it

A Progressive Web App (iOS first, Android second) that turns an EPUB into a deck of flash cards. The app ships with **graded lists of rare English words** (levels 1–10, each word with its German translation). On import, the book is matched against these lists: listed words above your personal level become cards, everything else is ignored but stays available for adding by hand. A Leitner-style spaced-repetition scheduler (inspired by jMemorize) then drills you chapter by chapter until you can read without stopping.

The target user is an advanced non-native reader (roughly C1/C2). Three design rules follow from that:
1. **Cards must be worth studying.** Only curated list words above your level become cards (Epic H), and a word that turns out to be known is retired after one swipe (C18).
2. **Nothing is lost.** Words that are not in the lists never become cards on their own, but they are counted and can be added by hand at any time (Epic D).
3. **Progress means reading flow.** The hero metric is text coverage per chapter: the share of running words you know, with 98 % as the "comfortable reading" target (Epic I).

---

## 1. Goals and non-goals

**Goals**
- Learn the *uncommon* words of a specific book before reading it.
- Zero-friction study: tap to flip, swipe to grade, close the app any time, resume exactly where you left off.
- Fully offline after the first install and word-list download.
- Domain logic and storage have **no UI dependencies**, so they can move to a backend later without a rewrite.

**Non-goals (v1)**
- No reading view for the EPUB itself (use your normal reader).
- No accounts, sync, or cloud storage (but the design prepares for it, see §7.7).
- No audio or pronunciation.
- No multi-word expressions ("give up"); single-word cards only.

---

## 2. User stories

IDs are referenced in the design. "Must" = v1, "Should" = v1 if cheap, "Could" = later. IDs are stable; gaps and order have no meaning.

### Epic A – Setup and word lists

| ID | Story | Priority |
|----|-------|----------|
| A1 | As a learner, I want to install the app to my iPhone home screen so it feels like a native app and my data is kept. | Must |
| A2 | As a learner, I want the app to download its word lists (English → German, built from public sources) on first run, with visible progress, so I don't have to find a dictionary myself. | Must |
| A3 | As a learner, I want to see the lists' name, version, sources, licences and size, and be able to update them. | Should |
| A4 | As a learner, I want to choose a different language pair (e.g. English→French) built the same way. | Could |
| A5 | As a learner, I want the lists to reach very rare, literary and archaic words, so the hardest words of a book get cards. | Must |
| A6 | As a learner, I want a short English definition on the card when no German translation exists, so the word is still learnable. | Must |

**Acceptance criteria (A2, A5, A6)**
- Download shows bytes/percent. Packs come in chunks of at most 2 MB, each verified by SHA-256; a failed download resumes at the first missing chunk.
- After download everything works offline.
- The lists cover the English lemmas of frequency rank 1,001–100,000 that have a Wiktionary entry (§6).
- A word with German translations shows them on the back, with the English definition below in smaller type. A word with only a definition shows the definition, marked "EN".
- Settings → *Use English definitions when no German translation exists* (default on). When off, such words are treated as "not in the lists" (D1).
- Licence attribution for all sources is shown in *Settings → About*.

### Epic B – Importing a book

| ID | Story | Priority |
|----|-------|----------|
| B1 | As a learner, I want to pick an EPUB from the Files app and have it turned into a deck. | Must |
| B2 | As a learner, I want only words from the lists that are above my level to become cards, so I only study words worth learning. | Must |
| B3 | As a learner, I want to adjust the level for one book and re-run the filter. | Should |
| B4 | As a learner, I want inflected forms ("strode", "striding") grouped under one card ("stride"). | Must |
| B5 | As a learner, I want names (characters, places, acronyms) excluded. | Must |
| B6 | As a learner, I want words that are not in the lists ignored for cards, but kept on a separate screen where I can add them by hand. | Must |
| B7 | As a learner, I want an import preview: works and chapters found, which are excluded, number of cards, words not in the lists, and estimated coverage. | Must |
| B8 | As a learner, I want words I already learned from a previous book skipped automatically. | Should |
| B9 | As a learner, I want each card to show an example sentence from the book so I learn the word in context. | Should |
| B10 | As a learner, I want new cards introduced in the order their words first occur in the book. | Must |
| B11 | As a learner, I want a collection of several novels recognised as separate works, with chapters named "Death or Glory · One", and to choose which works to study. | Must |
| B12 | As a learner, I want front and back matter (cover, table of contents, copyright, about the author, extracts from other books) left out by default. | Must |
| B13 | As a learner, I want the words of a footnote prepared together with the chapter that refers to it. | Should |
| B14 | As a learner, I want text that isn't part of the book (download-site watermarks, repeated headers) to be ignored. | Must |
| B15 | As a learner, I want words that are nearly identical to their German translation skipped by default. | Should |

**Acceptance criteria (B1–B15)**
- Import has two steps: *analyse* (parsing, matching, preview) and *confirm* (cards are created). Analysing a 330,000-word EPUB takes under ~20 s on a recent iPhone and never freezes the UI (Web Worker).
- A token is matched by exact lookup in the shipped forms table (§6.4). There is no guessing of word stems on the phone.
- A matched word becomes a card if its rank is above the learner's cutoff (H2; 8,000 if calibration was skipped), it isn't a known word (B8), isn't a name (B5), and isn't flagged as a cognate while B15 is on.
- Names: tokens written in capitals only ("PDF"), and words capitalised in ≥ 90 % of their occurrences that are not at the start of a sentence.
- The preview lists works and chapters with a checkbox each; excluded-by-default ones (B12) are unticked. The learner can change the ticks before confirming.
- The preview numbers add up: `distinct words = common + below level + known + cognates + names + cards + not in the lists`.
- Chapters, works, footnotes and watermark handling follow §7.1.

### Epic C – Studying

| ID | Story | Priority |
|----|-------|----------|
| C1 | As a learner, I want to see the English word on a card and **tap** to flip it to the German translation. | Must |
| C2 | As a learner, I want to **swipe right** to mark "I knew it" and **swipe left** to mark "I didn't". | Must |
| C3 | As a learner, I want cards I got wrong to come back later in the same session until I get them right. | Must |
| C4 | As a learner, I want cards I got right to come back after growing intervals (1, 2, 4, 8 … days) like jMemorize. | Must |
| C5 | As a learner, I want to close the app at any moment and continue exactly where I was (same card, same side, same session counters) when I reopen it. | Must |
| C6 | As a learner, I want to undo my last swipe in case I swiped by mistake (a short-lived "Undo" pill after each grade). | Should |
| C7 | As a learner using VoiceOver or a keyboard, I want accessible actions for flip, knew it, didn't know and the card menu, because the card has no visible buttons. | Must |
| C8 | As a learner, I want to choose a daily new-card limit so I'm not overwhelmed. | Should |
| C9 | As a learner, I want to study "ahead" when nothing is due, if I have time before reading. | Should |
| C10 | As a learner, I want studying to be full screen with nothing but the card, so I can focus. | Must |
| C11 | As a learner, I want to always see a thin progress bar for the current session, and a visible *Finish* button next to it. | Must |
| C12 | As a learner, I want to **swipe up** to reveal two buttons: *Edit card* and *Finish session*. | Must |
| C13 | As a learner, I want *Edit card* to let me change the translation of the current card or remove it, and then continue studying. | Must |
| C14 | As a learner, I want *Finish session* to end the session and show full-screen statistics for this session and my overall progress. | Must |
| C15 | As a learner, I want overlays explaining the gestures on the first card of every session. | Must |
| C16 | As a learner, I want the back side to carry links to Wiktionary and other dictionaries, and when I answer a card wrong without having turned it over, I want to see its back side. | Must |
| C17 | As a learner, I want to choose which lookup sites appear as links. | Should |
| C18 | As a learner, when I get a card right the very first time I see it, I want it retired for good, so words I already know cost me one swipe and never return. | Must |

**Acceptance criteria (C2, C5)**
- A swipe is committed when horizontal travel > 30 % of card width or velocity > 0.5 px/ms; otherwise the card springs back.
- The card tints green (right) / red (left) proportionally while dragging.
- A swipe grades *only after* the card has been flipped at least once (prevents accidental grading). Configurable.
- Every grade is persisted atomically together with the session position *before* the next card animates in. Killing the app at any time loses at most the current in-flight animation.

**Acceptance criteria (C10–C14)**
- The study screen shows only the card on a full-bleed background; no header, footer, or buttons are visible by default.
- A gesture's direction is fixed after 10 px of travel by its dominant axis: horizontal = grade, vertical = overlays. A vertical swipe never grades a card.
- Vertical swipes are only recognised if they start more than 44 px away from the top and bottom screen edges, so they don't fight iOS Notification/Control Center and the home indicator.
- The progress bar ("12 / 40") and a *Finish* text button sit at the top, below the safe area, all the time. Swipe down only closes the panel.
- Swipe up: a bottom panel with two large buttons slides in; the card dims. Swiping down or tapping the dimmed card closes the panel. The panel never grades or flips the card.
- *Edit card* opens a full-screen sheet with the translations (editable), *Save*, *Remove card*, *Mark as known* and *Cancel*. Saving keeps the current card and its side. Remove/known take the card out of the session queue and show the next card. All changes are persisted atomically with the session.
- *Finish session* marks the session finished; ungraded cards keep their due dates. Closing the app while the statistics screen is shown reopens the statistics, not the old session.

**Acceptance criteria (C15)**
- On the first card of each session, a translucent overlay shows five hints at the place where each gesture happens: tap (centre), swipe right ✓, swipe left ✗, swipe up = edit card.
- Before the first flip only *Tap to flip* plus the up/down hints are shown; after the flip, the left/right grading hints appear.
- The overlay never blocks input. Each hint fades out once its gesture has been used. All hints are gone after the first card is graded.
- Hints also appear when a session is resumed on a card that is still the session's first.
- Settings has *Gesture hints: Every session (default) / Off*. VoiceOver users get the same text as a spoken announcement.

**Acceptance criteria (C16–C17)**
- Every back side ends with a row of lookup links.
- Swiping left grades the card *didn't know* immediately (persisted, re-queued, counters updated). After a flip the back has been seen, so the card flies off like a right swipe. Swiped left from the front (only with *Flip before grading* off), the card swings back to the centre and shows its back side once in **review mode**.
- Default links: **Wiktionary**, **dict.cc**, **LEO**, **Linguee**, **Cambridge Dictionary**. Each opens the lemma's page in the system browser (in-app Safari sheet on iOS), so you come back to the same card.
- To continue: tap the card outside the links, or swipe left or right. In review mode, swipes never grade again.
- Undo still works in review mode and reverts the *didn't know* grade.
- Review mode is part of the persisted session state.
- When offline, the links are greyed out with a short "offline" note.
- Settings → *Lookup links*: toggle and reorder the providers, and add a custom one with a URL template containing `{word}`. Only `https` URLs are accepted.

**Acceptance criteria (C18)**
- "First sight" means the card has never been graded (`stats.correct === 0 && stats.wrong === 0`). The card must still be flipped before it can be swiped.
- Swiping right at first sight sets the card's status to `known`, removes it from the session queue, never schedules it, and adds its lemma to the global known words, so future books skip it (B8).
- The undo pill reads "Already known · Undo" for 3 s. Undo restores the card, the queue and the known-words entry.
- These grades are counted separately as `alreadyKnown`. They are excluded from session accuracy, from *On a Roll* and from *Word Hoard*, and they do not reset the *On a Roll* streak.
- A retired card doesn't use up the daily new-card limit: the next unseen card is pulled into the session (§7.3).
- For coverage (I2) a retired card counts as known immediately.
- Settings → *First-try correct: Retire the card (default) / Schedule normally*.

### Epic D – Managing cards and adding words by hand

| ID | Story | Priority |
|----|-------|----------|
| D1 | As a learner, I want a screen listing the book's words that are **not in the lists**, with how often each occurs and an example sentence, so nothing is invisible. | Must |
| D2 | As a learner, I want to type a translation for such a word and activate it, so it joins my deck at its place in the book. | Must |
| D3 | As a learner, I want to remove (hide) any card so it never shows up again. | Must |
| D4 | As a learner, I want to restore removed cards. | Should |
| D5 | As a learner, I want to edit the translation of an existing card. | Should |
| D6 | As a learner, I want to search and filter the word screen (not in the lists / active / known / removed / skipped). | Should |
| D7 | As a learner, I want to mark a word as "already known" so it's removed here and in future books. | Should |
| D8 | As a learner, I want to add **any word** as a card by typing it, even one the app skipped as too easy or one that isn't in the book. | Must |
| D9 | As a learner, I want lookup links in the add sheet, so I can find a translation without leaving the flow. | Should |

**Acceptance criteria (D1, D2, D8, D9)**
- *Not in the lists* is sorted by occurrences, most frequent first. Names (B5) are hidden behind a "Show names" toggle. Each row: word, "×N", example snippet, chapter of first occurrence.
- Tapping a row opens the add sheet: word, example, translation field, lookup links (same providers as C16), *Add card*, *Ignore* (hides the row for this book).
- *Add word* (a "+" button on the word screen) opens the same sheet with a text field. While typing, the app shows what it knows: "in the lists, level 4, skipped as below your level" with the list translation prefilled, or "appears 3× in this book, not in the lists", or "not in this book".
- A word added by hand becomes an active card with `translationSource: 'manual'`. If it occurs in the book it takes its real position, chapter and example; it then counts for coverage like any other card. If it doesn't occur in the book, it is placed at the start of the chapter currently being learned and has no effect on coverage.
- A hand-added card is studied, scheduled, retired at first sight and backed up like any other card. Re-filtering (B3) never deletes it.
- The typed word is matched like a book token (§7.1), so typing "strode" adds the card "stride".

### Epic E – Progress and motivation

| ID | Story | Priority |
|----|-------|----------|
| E1 | As a learner, I want to see how ready I am for a book as text coverage (Epic I), per chapter and for the whole book. | Must |
| E2 | As a learner, I want to see my cards distributed across learning levels as a visual of boxes filling up. | Must |
| E3 | As a learner, I want a session summary with accuracy, cards reviewed, and cards promoted. | Must |
| E4 | As a learner, I want a daily streak and a daily goal ring. | Should |
| E5 | As a learner, I want small celebrations (animation, sound off by default) at milestones: a chapter becoming ready to read, the whole book reaching the coverage target, streak records, first perfect session. | Should |
| E6 | As a learner, I want a history chart of success rate and reviews per day. | Could |

### Epic G – Achievements (Steam-style)

A default set of achievements is enabled out of the box. Tiered achievements have bronze, silver and gold levels.

| ID | Story | Priority |
|----|-------|----------|
| G1 | As a learner, I want **On a Roll** achievements for correct answers in a row: bronze at 5, silver at 10, gold at 20. | Must |
| G8 | As a learner, I want **Word Hoard** achievements for my total number of correct answers: bronze at 50, silver at 100, gold at 150. | Must |
| G2 | As a learner, I want **Bookworm** achievements for finishing books: a per-book "Ready for *‹title›*" badge, plus bronze/silver/gold for 1 / 5 / 10 finished books. | Must |
| G3 | As a learner, I want **Comeback** achievements when I finally get a card right after getting it wrong 3 or more times in a row: bronze/silver/gold for 1 / 10 / 25 such cards. | Must |
| G4 | As a learner, I want a Steam-like pop-up the moment I unlock something, without interrupting my study flow. | Must |
| G5 | As a learner, I want an achievements screen showing unlocked ones (with date) and locked ones with a progress bar ("87 / 100"). | Must |
| G6 | As a learner, I want the statistics screen to list achievements unlocked in this session. | Should |
| G7 | As a learner, I want to turn achievement pop-ups off in Settings while still collecting them. | Should |

**Acceptance criteria (G1–G8)**
- *On a Roll* counts consecutive **known** grades across sessions and books. Any *didn't know* resets it to 0. Undo restores the counter to its previous value. Re-queued attempts within a session count like any other grade.
- *Word Hoard* counts all **known** grades ever (across sessions and books, never reset). Undo decrements it. Removing a card or deleting a book doesn't reduce it.
- A book is *finished* the first time every one of its included chapters is ready to read (coverage ≥ target, I3). Later lapses or re-filtering can't un-finish it.
- *Comeback*: a card's `failStreak` (consecutive *didn't know* on that card) is ≥ 3 at the moment it is graded *known*. Then `failStreak` resets to 0. Each card can trigger it more than once.
- Achievements are never revoked once unlocked, even if the triggering grade is undone.
- If a single grade unlocks several achievements, pop-ups are queued, each shown for 5 s; a tap dismisses one early.
- The pop-up is a large banner sliding in from the top (below the safe area): big tier-coloured medal icon, achievement name and tier in large type, description. Its only input is a tap to dismiss it; the tap never reaches the card. Gold unlocks also get a short shimmer. Full confetti is reserved for the statistics screen.
- Unlocks are persisted in the same transaction as the grade that caused them.

### Epic H – Personal vocabulary level

| ID | Story | Priority |
|----|-------|----------|
| H1 | As a learner, I want a two-minute vocabulary check at first start, so the app knows which list levels I can skip. | Must |
| H2 | As a learner, I want the result shown in plain words ("you start at level 6") and used as my personal cutoff for every import. | Must |
| H3 | As a learner, I want to skip the check, repeat it later, or set the level by hand. | Must |
| H4 | As a learner, when my level changes, I want to be offered to re-filter my existing books. | Should |

**Acceptance criteria (H1–H4)**
- The check runs after the word-list download and before the first import. It uses the study card UI: English word on the front, tap to flip, swipe right = knew it, swipe left = didn't. Nothing is scheduled and no achievements are affected.
- It shows 60 list words in two stages (20 spread over all ten levels, then 40 concentrated around the estimated level), with a "12 / 60" counter. Algorithm in §7.8.
- Test words have a German translation, are at least 4 letters long, and are not flagged as cognates.
- The check can be closed at any time and resumes at the same word.
- Result screen: the level you start at, the exact cutoff rank, and a one-line explanation. Buttons: *Use this*, *Adjust* (slider over ranks 2,000–60,000, step 500, with level marks), *Repeat*.
- *Skip* sets the cutoff to 8,000 (level 5) and marks the profile as `default`; Library then shows a dismissible "Check your level for better word selection" hint.
- A changed cutoff applies to future imports. For each existing book the app offers *Re-filter* (B3); cards with review history, manual edits or manual origin are never touched.

### Epic I – Chapters and reading coverage

| ID | Story | Priority |
|----|-------|----------|
| I1 | As a learner, I want the book split into its chapters and my study to follow them, so I can start reading chapter 1 while I prepare chapter 2. | Must |
| I2 | As a learner, I want to see for each chapter and for the book which share of the running words I know ("97.4 %, about one unknown word every 38 words"). | Must |
| I3 | As a learner, I want a chapter marked "ready to read" at 98 % coverage, and new words then taken from the next chapter. | Must |
| I4 | As a learner, I want to pick a chapter myself and study its words, including ones left over after it became ready. | Must |
| I5 | As a learner, I want to change the coverage target (95–100 %). | Should |
| I6 | As a learner, I want to see per chapter how many words are not in the lists, so I know what coverage doesn't include. | Must |

**Acceptance criteria (I1–I6)**
- Coverage of a chapter = 1 − (occurrences of unknown cards ÷ running words of that chapter). A card is **unknown** while it is active with level < 2. Everything else counts as known.
- Words that are not in the lists are **not** part of coverage. Each chapter shows them separately ("14 words not in the lists"), linking to the word screen filtered to that chapter. Once such a word is added by hand, it counts.
- Coverage is always labelled "estimated".
- Chapter states: *Ready* (coverage ≥ target), *Learning* (the chapter new cards currently come from), *Upcoming*.
- New cards come from the first included chapter that isn't ready, in order of first occurrence in that chapter. That includes words first seen in earlier chapters that are still unlearned. Due reviews always come first, whatever their chapter.
- When a chapter becomes ready during a session, a banner says "Death or Glory · Three is ready to read" (once per chapter), and new cards continue from the next chapter.
- A chapter can fall back below the target when cards are forgotten. Its state then changes back, but the banner isn't repeated.
- Book overview lists works (collapsible) and their chapters with a coverage bar, a 98 % marker and the state. Tapping a chapter offers *Study this chapter*.
- The statistics screen shows the coverage change of the current chapter and of the book for this session.

### Epic F – Data safety

| ID | Story | Priority |
|----|-------|----------|
| F1 | As a learner, I want to export all my data to a JSON file and import it again, so I don't lose progress if iOS clears storage or I change phones. | Must |
| F2 | As a learner, I want to delete a book and its cards. | Must |

---

## 3. Key decisions

| Topic | Decision | Why |
|---|---|---|
| Platform | Installable PWA, `display: standalone` | iOS Home Screen apps with standalone/fullscreen display get their own storage container and are exempt from Safari's 7-day storage purge for ordinary tabs. Users are told to install before importing. |
| Language | TypeScript (strict) | Same code runs in browser, Web Worker and Node. |
| UI | Svelte 5 + Vite + `vite-plugin-pwa` (Workbox) | Small bundle, fast on mobile. Swappable because the core doesn't know about it. |
| Storage | IndexedDB via Dexie, behind repository interfaces | Large capacity on installed iOS web apps, transactional, indexable. |
| Scheduling | Leitner levels with doubling intervals (jMemorize-style) | Simple, predictable. Strategy interface allows SM-2/FSRS later. |
| Heavy work | Web Worker (EPUB parse, matching) | Keeps swipe animations at 60 fps. |
| Word selection | **Allow-list**: shipped graded word lists decide what becomes a card; unlisted words are ignored but can be added by hand | Removes noise (names, invented words, watermarks, fragments) by construction, guarantees a translation for every card, and moves all curation to build time. |
| Word forms | **Shipped forms table**, built from Wiktionary; exact lookup on the phone, no stemming rules | Irregular forms and ambiguous forms are resolved once at build time, reproducibly. See §6.4. |
| Personal level | Cutoff rank from a 60-word calibration, plus retiring cards known at first sight | A fixed cutoff makes an advanced reader skip most cards. See §7.8 and C18. |
| Progress metric | Estimated text coverage per chapter, target 98 % | Measures reading flow directly. See §7.5. |

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────┐
│ apps/pwa  (Svelte UI, routing, gestures, animations)     │
│   depends on ▼ only through the Application API          │
├──────────────────────────────────────────────────────────┤
│ packages/core  (pure TypeScript, no DOM, no IndexedDB)   │
│   domain/      entities, value objects, rules            │
│   services/    ImportService, StudyService, CardService, │
│                ProgressService, CalibrationService,      │
│                AchievementService                        │
│   ports/       repository + infrastructure interfaces    │
│   app.ts       createApp(ports) → Application API        │
├──────────────────────────────────────────────────────────┤
│ adapters (implement ports)                               │
│   packages/storage-idb     Dexie repositories            │
│   packages/epub-browser    JSZip + DOMParser EPUB reader │
│   packages/word-packs      pack download + WordList      │
│   (later) storage-http     REST client for a backend     │
├──────────────────────────────────────────────────────────┤
│ tools/build-word-packs  (Node, CI only; not shipped)     │
└──────────────────────────────────────────────────────────┘
```

**Rules**
1. `core` imports nothing from `apps/` or any adapter. Enforced with an ESLint `no-restricted-imports` rule and a dependency-cruiser check in CI.
2. `core` uses no browser globals (`window`, `document`, `indexedDB`, `localStorage`). It compiles against `lib: ["ES2022"]` without `"DOM"`.
3. Time, IDs and randomness are injected (`Clock`, `IdGenerator`, `Random`), so behaviour is deterministic in tests.
4. The UI only calls the **Application API** (a facade). Moving to a backend = putting the same facade behind HTTP.

### 4.1 Ports (interfaces in `core/ports`)

```ts
export interface BookRepository {
  get(id: BookId): Promise<Book | undefined>;
  list(): Promise<Book[]>;
  save(book: Book): Promise<void>;
  delete(id: BookId): Promise<void>;          // cascades to cards, book lemmas, sessions
}

export interface CardRepository {
  get(id: CardId): Promise<Card | undefined>;
  listByBook(bookId: BookId, filter?: CardFilter): Promise<Card[]>;
  saveMany(cards: Card[]): Promise<void>;
  deleteMany(ids: CardId[]): Promise<void>;
}

export interface BookLemmaRepository {        // every distinct word of a book except common ones
  saveMany(rows: BookLemma[]): Promise<void>;
  get(bookId: BookId, lemma: string): Promise<BookLemma | undefined>;
  listByBook(bookId: BookId, kind?: BookLemma['kind']): Promise<BookLemma[]>;
}

export interface ImportDraftRepository {      // result of "analyse", waiting for "confirm"
  get(id: string): Promise<ImportDraft | undefined>;
  save(draft: ImportDraft): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SessionRepository {
  getActive(bookId: BookId): Promise<StudySession | undefined>;
  save(session: StudySession): Promise<void>;
}

export interface ReviewLogRepository {
  append(entry: ReviewLogEntry): Promise<void>;
  listSince(since: Date): Promise<ReviewLogEntry[]>;
}

export interface AchievementRepository {
  getStats(): Promise<LearnerStats>;
  saveStats(stats: LearnerStats): Promise<void>;
  listUnlocks(): Promise<AchievementUnlock[]>;
  addUnlocks(unlocks: AchievementUnlock[]): Promise<void>;
}

export interface KnownWordRepository {        // global, across books (B8, D7, C18)
  hasMany(lemmas: string[]): Promise<Set<string>>;
  addMany(lemmas: string[]): Promise<void>;
  remove(lemma: string): Promise<void>;       // needed to undo a first-sight retirement
}

export interface ProfileRepository {          // Epic H
  getProfile(): Promise<VocabularyProfile | undefined>;
  saveProfile(profile: VocabularyProfile): Promise<void>;
  getCalibration(): Promise<CalibrationSession | undefined>;
  saveCalibration(session: CalibrationSession | undefined): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

/** Atomic multi-repository write — required for C5. */
export interface UnitOfWork {
  run<T>(work: (tx: Repositories) => Promise<T>): Promise<T>;
}

/** The shipped word lists (§6). Replaces dictionary, frequency list and lemmatiser. */
export interface WordList {
  info(): Promise<PackInfo[]>;
  /** token → lemma. '' means "common word, always known". Absent key = not in the lists.
   *  Looks in the forms table first, then in the word table (§6.4). */
  resolve(tokens: string[]): Promise<Map<string, string>>;
  entries(lemmas: string[]): Promise<Map<string, WordEntry>>;
  /** The listed word with the smallest rank ≥ `rank` and ≤ `maxRank` (calibration sampling). */
  firstAtOrAfter(rank: number, maxRank: number): Promise<WordEntry | undefined>;
}

export interface WordEntry {
  lemma: string;
  rank: number;                     // 1,001 … 100,000; level is derived from it (§6.2)
  pos: string[];
  de: string[];                     // German translations from Wiktionary, best first
  deFreedict: string[];             // from the FreeDict supplement; used when `de` is empty
  def?: string;                     // short English definition
  cognate: boolean;                 // nearly identical to its German translation (B15)
}

export interface EpubReader {
  read(file: ArrayBuffer): Promise<EpubContent>;
}

export interface EpubContent {
  meta: { title: string; author?: string; coverDataUrl?: string };
  /** Table of contents (EPUB 3 nav document, else EPUB 2 toc.ncx), in document order. */
  toc: { title: string; depth: number; section: number }[];
  /** Spine order. A block is one paragraph-level element. Text of links that point
   *  outside the book is already removed. */
  sections: {
    blocks: {
      text: string;
      anchorIds: string[];                                   // ids on or inside the block
      links: { section: number; anchorId?: string }[];       // internal links only
    }[];
  }[];
}

export interface Clock        { now(): Date; }
export interface IdGenerator  { next(): string; }
export interface Random       { next(): number; }   // [0, 1); seeded in tests
```

### 4.2 Application API (what the UI calls)

```ts
interface VocabApp {
  wordLists: {
    status(): Promise<PackStatus>;
    install(onProgress: (p: Progress) => void): Promise<void>;
  };
  calibration: {                                               // Epic H
    startOrResume(): Promise<CalibrationView>;                 // current word, position, total
    answer(known: boolean): Promise<CalibrationView>;          // view.result is set after word 60
    skip(): Promise<VocabularyProfile>;                        // cutoff 8,000, source 'default'
    profile(): Promise<VocabularyProfile | undefined>;
    setCutoff(rank: number): Promise<VocabularyProfile>;       // source 'manual'
  };
  books: {
    analyse(file: ArrayBuffer, onProgress): Promise<ImportPreview>;          // step 1 (B7)
    confirm(draftId: string, opts: ConfirmOptions): Promise<BookOverview>;   // step 2
    discard(draftId: string): Promise<void>;
    list(): Promise<BookOverview[]>;
    chapters(id: BookId): Promise<ChapterProgress[]>;          // Epic I
    delete(id: BookId): Promise<void>;
    reapplyFilter(id: BookId, opts: ConfirmOptions): Promise<BookOverview>;  // B3, H4
  };
  study: {
    resumeOrStart(bookId: BookId, opts?: SessionOptions): Promise<SessionView>;
    flip(sessionId: SessionId): Promise<SessionView>;
    grade(sessionId: SessionId, result: 'known' | 'unknown'): Promise<SessionView>;
    continueAfterReview(sessionId: SessionId): Promise<SessionView>;  // leaves wrongReview (C16, wrong swipe on the front)
    undo(sessionId: SessionId): Promise<SessionView>;
    editCurrent(sessionId: SessionId, translations: string[]): Promise<SessionView>;    // C13
    removeCurrent(sessionId: SessionId, as: 'removed' | 'known'): Promise<SessionView>; // C13
    finish(sessionId: SessionId): Promise<SessionStatistics>;                           // C14
  };
  cards: {
    list(bookId: BookId, filter: CardFilter): Promise<CardView[]>;
    unlisted(bookId: BookId, opts: { chapterIndex?: number; includeNames?: boolean;
                                     search?: string }): Promise<UnlistedWordView[]>;   // D1
    suggest(bookId: BookId, typed: string): Promise<WordSuggestion>;                    // D8
    addWord(bookId: BookId, typed: string, translations: string[]): Promise<CardView>;  // D2, D8
    ignoreUnlisted(bookId: BookId, lemma: string): Promise<void>;
    editTranslation(cardId: CardId, translations: string[]): Promise<void>;
    remove(cardId: CardId): Promise<void>;
    restore(cardId: CardId): Promise<void>;
    markKnown(cardId: CardId): Promise<void>;
  };
  progress: {
    book(bookId: BookId): Promise<BookProgress>;
    daily(range: DateRange): Promise<DailyStats[]>;
  };
  achievements: {
    list(): Promise<AchievementView[]>;   // definition + unlocked tiers + progress (G5)
  };
  settings: { get(): Promise<Settings>; update(patch: Partial<Settings>): Promise<Settings>; };
  backup: {
    export(): Promise<BackupV1>;    // plain JSON object; UI turns it into a file
    import(data: BackupV1): Promise<void>;
  };
}

interface ConfirmOptions { includedChapters: number[]; cutoffRank?: number; }
interface SessionOptions { chapterIndex?: number; studyAhead?: boolean; }   // chapterIndex = I4

interface WordSuggestion {
  lemma: string;                                    // after matching ("strode" → "stride")
  listed?: { level: number; rank: number; translations: string[]; definition?: string };
  inBook?: { occurrences: number; chapterIndex: number; example?: string;
             kind: BookLemma['kind'] };
  existingCardId?: CardId;                          // already a card (any status)
  lookupLinks: { name: string; url: string }[];
}
```

`SessionView` (returned by every study call) contains the current card and phase, the counters, and:
- `newAchievements: AchievementUnlock[]` — unlocks caused by that call (G4);
- `lookupLinks: { name; url }[]` in the `back` and `wrongReview` phases (C16);
- `chapter: { index; title; coverage }` for the chapter new cards come from;
- `chapterReady?: { index; title }` when that call made a chapter ready for the first time (I3);
- `retired: boolean` when the call retired a card at first sight (C18).

All return values are plain serialisable objects (no class instances, no functions), so the same API can be served over HTTP or `postMessage` unchanged.

---

## 5. Domain model

```ts
type CardStatus = 'active' | 'removed' | 'known';

interface Book {
  id: BookId;
  title: string; author?: string; language: 'en';
  importedAt: string;               // ISO
  cutoffRank: number;               // cutoff used for this book
  stats: { wordTokens: number; distinctWords: number };
  coverDataUrl?: string;            // small thumbnail
  works: Work[];                    // B11; a plain novel has exactly one
  chapters: Chapter[];
  chaptersAnnounced: number[];      // chapter indexes whose "ready" banner was shown
  finishedAt?: string;              // first time all included chapters were ready (G2)
}

interface Work { index: number; title: string; }

interface Chapter {
  index: number;                    // 0-based, reading order
  workIndex: number;
  title: string;                    // "One"; shown as "Death or Glory · One" when the book
                                    // has several works; max 60 chars
  kind: 'story' | 'frontMatter' | 'backMatter';
  included: boolean;                // studied and counted? (B11, B12)
  wordTokens: number;               // word tokens incl. its footnotes, names and common words
}

/** One row per distinct word of a book, except common words. Source for re-filtering,
 *  the "not in the lists" screen and adding by hand. */
interface BookLemma {
  bookId: BookId;
  lemma: string;                    // list lemma, or the normalised token if unlisted
  kind: 'card' | 'belowLevel' | 'known' | 'cognate' | 'name' | 'unlisted';
  forms: string[];                  // surface forms seen in the book
  occurrences: number;
  occurrencesByChapter: Record<number, number>;   // sparse: chapter index → count
  firstPosition: number;            // reading-order token index of the first occurrence
  example?: string;
  ignored?: boolean;                // hidden in "not in the lists" (D1)
}

interface Card {
  id: CardId;                       // `${bookId}:${lemma}` — deterministic
  bookId: BookId;
  lemma: string;                    // "stride"
  forms: string[];                  // ["strode", "striding"]
  occurrences: number;              // 0 for a hand-added word that isn't in the book
  occurrencesByChapter: Record<number, number>;
  firstPosition: number;            // → initial order (B10)
  chapterIndex: number;             // chapter of the first occurrence
  example?: string;
  listLevel?: number;               // 1–10; undefined for unlisted words
  translations: string[];           // max 4; empty for definition-only cards
  definition?: string;              // short English definition (A6)
  pos: string[];
  translationSource: 'list' | 'definition' | 'manual';
  origin: 'import' | 'manual';      // manual = added by hand (D2, D8); never auto-deleted
  status: CardStatus;
  // scheduling (jMemorize-style)
  level: number;                    // 0 = unlearned
  dueAt?: string;                   // ISO, undefined for level 0
  stats: { correct: number; wrong: number; failStreak: number; lastReviewedAt?: string };
}

interface ImportDraft {             // persisted between analyse and confirm
  id: string; createdAt: string;
  book: Omit<Book, 'id' | 'importedAt' | 'cutoffRank' | 'chaptersAnnounced'>;
  lemmas: Omit<BookLemma, 'bookId' | 'kind'>[];   // classified at confirm time
  listedLemmas: string[];           // which of them are list words
  nameLemmas: string[];
}

interface ImportPreview {
  draftId: string;
  title: string; author?: string;
  works: { index: number; title: string;
           chapters: { index: number; title: string; kind: Chapter['kind'];
                       included: boolean; wordTokens: number }[] }[];
  cutoffRank: number; level: number;
  counts: { distinctWords: number; common: number; belowLevel: number; known: number;
            cognates: number; names: number; cards: number; unlisted: number };
  cardsPerListLevel: Record<number, number>;
  coverageBefore: number;           // estimated, for the included chapters
}

interface ChapterProgress {
  index: number; workIndex: number; title: string; displayTitle: string;
  included: boolean; wordTokens: number;
  coverage: number;                 // 0..1, estimated
  unknownEvery: number | null;      // round(1 / (1 − coverage)); null at 100 %
  state: 'ready' | 'learning' | 'upcoming' | 'excluded';
  cards: { unseen: number; learning: number; learned: number };
  unlisted: { words: number; occurrences: number };   // names excluded (I6)
}

interface StudySession {
  id: SessionId;
  bookId: BookId;
  startedAt: string;
  queue: CardId[];                  // remaining, in order
  current?: { cardId: CardId; phase: 'front' | 'back' | 'wrongReview' };
  undo?: { cardId: CardId; before: CardSnapshot; queueBefore: CardId[];
           statsBefore: LearnerStats; addedKnownWord?: string };
  counters: { reviewed: number; correct: number; wrong: number; promoted: number;
              alreadyKnown: number };   // first-sight retirements (C18), not part of `reviewed`
  targetChapter?: number;           // set when started with *Study this chapter* (I4)
  coverageAtStart: { book: number; chapter: number };
  state: 'active' | 'finished';
  finishedAt?: string;              // set by finish(); app reopens on the statistics screen
}

interface SessionStatistics {       // C14 — plain JSON, computed by ProgressService
  session: { reviewed: number; firstTryAccuracy: number; promoted: number; demoted: number;
             alreadyKnown: number; removed: number; durationSec: number };
  book: BookProgress;               // coverage (book + chapters), change in this session,
                                    // cards per level, words not in the lists
  overall: { streakDays: number; longestStreak: number; reviewsToday: number;
             dailyGoal: number; wordsLearnedAllBooks: number };
  achievements: AchievementUnlock[];   // unlocked in this session (G6)
}

interface VocabularyProfile {       // Epic H, one record
  cutoffRank: number;               // list words with rank ≤ cutoffRank are assumed known
  r50?: number; k?: number;         // fitted model, absent for 'default' and 'manual'
  source: 'calibration' | 'manual' | 'default';
  updatedAt: string;
}

interface CalibrationSession {      // persisted so the check can be resumed
  items: { lemma: string; rank: number; level: number; de: string[]; known?: boolean }[];
  position: number;
  stage: 1 | 2;
}

/** Global learner counters, one record (G1–G3, G8). */
interface LearnerStats {
  correctStreak: number;            // current run of consecutive "known" grades
  bestCorrectStreak: number;
  totalCorrect: number;             // all "known" grades ever (G8)
  booksFinished: BookId[];
  comebacks: number;
}

type Tier = 'bronze' | 'silver' | 'gold';

/** Definitions are data, so new achievements need no code in the UI. */
interface AchievementDefinition {
  id: 'on-a-roll' | 'word-hoard' | 'bookworm' | 'comeback' | `ready:${BookId}`;
  name: string; description: string;
  metric: 'bestCorrectStreak' | 'totalCorrect' | 'booksFinished' | 'comebacks' | 'bookFinished';
  tiers: { tier: Tier; threshold: number }[];   // on-a-roll 5/10/20, word-hoard 50/100/150
}

interface AchievementUnlock {
  achievementId: string; tier?: Tier;
  unlockedAt: string; sessionId?: SessionId;
}

/** Lookup link providers (C16–C17, D9) — data, stored in settings. */
interface LookupProvider {
  id: string; name: string; enabled: boolean; order: number;
  urlTemplate: string;              // must be https and contain {word}
}

const DEFAULT_LOOKUP_PROVIDERS: LookupProvider[] = [
  { id: 'wiktionary', name: 'Wiktionary', enabled: true, order: 1,
    urlTemplate: 'https://en.wiktionary.org/wiki/{word}#English' },
  { id: 'dictcc',     name: 'dict.cc',    enabled: true, order: 2,
    urlTemplate: 'https://www.dict.cc/?s={word}' },
  { id: 'leo',        name: 'LEO',        enabled: true, order: 3,
    urlTemplate: 'https://dict.leo.org/englisch-deutsch/{word}' },
  { id: 'linguee',    name: 'Linguee',    enabled: true, order: 4,
    urlTemplate: 'https://www.linguee.de/deutsch-englisch/search?query={word}' },
  { id: 'cambridge',  name: 'Cambridge',  enabled: true, order: 5,
    urlTemplate: 'https://dictionary.cambridge.org/dictionary/english/{word}' },
];

/** Pure helper in core: encodeURIComponent(lemma) into each enabled template. */
function lookupLinks(lemma: string, providers: LookupProvider[]): { name: string; url: string }[];

interface ReviewLogEntry {
  cardId: CardId; bookId: BookId; at: string;
  result: 'known' | 'unknown'; levelBefore: number; levelAfter: number;
}

interface Settings {
  dailyNewLimit: number;            // 20
  dailyGoal: number;                // 20 reviews
  coverageTarget: number;           // 0.98
  retireOnFirstTry: boolean;        // true
  useEnglishDefinitions: boolean;   // true
  skipCognates: boolean;            // true
  requireFlipBeforeGrade: boolean;  // true; the first swipe on a front asks once whether to turn it off (study and check)
  gestureHints: 'everySession' | 'off';
  achievementPopups: boolean;       // true
  lookupProviders: LookupProvider[];
  scheduler: SchedulerConfig;
}
```

---

## 6. Word lists

### 6.1 Sources

| Source | Used for | Licence |
|---|---|---|
| **Wiktionary via kaikki.org** (Wiktextract JSONL, English-language entries) | which words exist, parts of speech, German translations, definitions, inflected forms and spelling variants | CC BY-SA |
| **FreeDict `eng-deu`** (TEI XML, derived from TU Chemnitz's "Ding") | German translations where Wiktionary has none | GPL |
| **A public English word-frequency list** (e.g. `wordfreq` data) | ranking the words into levels; build-time only | depends on the list chosen |

Attribution for all sources is shown in *Settings → About* and in `LICENSES.md`.

A PWA can only `fetch()` cross-origin files when the server sends CORS headers, which dictionary mirrors usually don't, and the raw data is far too large for a phone. So `tools/build-word-packs` (Node, runs in CI) downloads the sources, builds three compact packs, and publishes them as static files next to the app.

### 6.2 Levels

Every listed word has a **rank** (1 = most common English lemma). Levels are rank bands:

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| rank from | 1,001 | 2,001 | 3,001 | 5,001 | 7,501 | 10,001 | 15,001 | 20,001 | 30,001 | 45,001 |
| rank to | 2,000 | 3,000 | 5,000 | 7,500 | 10,000 | 15,000 | 20,000 | 30,000 | 45,000 | 100,000 |

- Ranks 1–1,000 are **common words**: never cards, always counted as known.
- Ranks above 100,000, and words without a Wiktionary entry, are **not in the lists**.
- The learner's cutoff is a rank, so it can sit inside a level; levels are for display, sampling and motivation.

### 6.3 Packs

`packs/manifest.json`:

```json
{
  "formatVersion": 1,
  "packs": [
    { "id": "words-en-de", "version": "2026-11-01", "sources": ["https://kaikki.org/…"],
      "licence": "CC BY-SA 4.0", "entryCount": 0,
      "chunks": [ { "file": "words-en-de.000.json.gz", "bytes": 0, "sha256": "…" } ] },
    { "id": "words-de-freedict", "…": "…" },
    { "id": "forms-en", "…": "…" }
  ]
}
```

| Pack | Licence | Chunk content (JSON array of rows, sorted by first element) | IndexedDB store |
|---|---|---|---|
| `words-en-de` | CC BY-SA | `[lemma, rank, pos[], de[], def \| null, flags]` — `flags` bit 0 = cognate | `words`, key `lemma`, index `rank` |
| `words-de-freedict` | GPL | `[lemma, de[]]` — only list lemmas whose Wiktionary `de` is empty | `wordsFreedict`, key `lemma` |
| `forms-en` | CC BY-SA | `[form, lemma]` — `lemma` is `""` for forms of common words | `forms`, key `form` |

Chunks are cut at about 2 MB compressed. Everything is lowercase NFC. The two translation packs stay separate files and stores because their licences differ. Target size for all packs together: under 10 MB compressed (CI prints the real sizes; if exceeded, drop `def` for entries that have German translations).

**Build rules — word table**
1. From Wiktextract, keep English entries whose `pos` is one of noun, verb, adj, adv, intj, prep, conj, pron, det, num. Drop `name` entries and headwords containing spaces, digits or apostrophes. Hyphenated headwords are kept.
2. An entry all of whose senses are "form of" or "alternative form of" another word is not a lemma; it only feeds the forms table (§6.4).
3. Per lemma, merge all parts of speech: `pos` = union, with the main part of speech first (the one the first German translation belongs to, else the first entry's) and the rest sorted; `de` = the `word` of every `translations` item with language code `de`, in source order, de-duplicated, at most 6; `def` = first gloss of the first real sense, cut at 140 characters on a word boundary.
4. Rank: map every form of the frequency list to its lemma using the forms table of §6.4, sum the frequencies per lemma, sort descending. Rank 1,001–100,000 go into the word table.
5. FreeDict: parse TEI `entry` elements (headword `orth`, translations `cit[type=trans]/quote`, at most 6). Emit a `words-de-freedict` row for each list lemma with empty `de`.
6. Drop list lemmas that have no `de`, no FreeDict translation and no `def`.
7. Cognate flag: set if for any of the first 3 German translations `t`: `similarity(lemma, norm(t)) ≥ 0.8`, where `norm` lowercases, strips a leading article ("der ", "die ", "das "), and maps ä→a, ö→o, ü→u, ß→ss, and `similarity = 1 − levenshtein(a, b) / max(a.length, b.length)`. ("melancholy"/"Melancholie" is flagged; "gift"/"Geschenk" is not.)
8. The Wiktextract field names here are from memory of its schema (it has used both `code` and `lang_code`). The builder must check them against the current data and fail loudly if `de` comes out empty for more than half of a 1,000-entry sample of level-1 words.

**Card content from a `WordEntry`** (`resolveCardContent`, pure):
1. `de` non-empty → `translations = de.slice(0, 4)`, `definition = def`, source `list`.
2. else `deFreedict` non-empty → `translations = deFreedict.slice(0, 4)`, `definition = def`, source `list`.
3. else `def` exists and `settings.useEnglishDefinitions` → `translations = []`, `definition = def`, source `definition`.
4. else → the word is treated as not in the lists.

### 6.4 Matching word forms

**Problem.** The book contains "strode", "striding", "colour", "shelves"; the list contains "stride", "color", "shelf". Guessing stems with rules on the phone is unreliable (irregular forms, "bore" = past of "bear" or the noun "bore") and hard to test.

**Solution.** Resolve everything once at build time and ship the result as a lookup table. On the phone, matching is two exact lookups.

*Build (`forms-en`):*
1. Collect candidate pairs `(form, lemma)` for all lemmas of rank ≤ 100,000 (including the common ones):
   - every item of the entry's `forms` list (plural, third person, past, participles, comparative, superlative);
   - every entry that is a "form of" or "alternative form of" a lemma (this covers irregular forms and British/American spellings);
   - the identity pair `(lemma, lemma)`;
   - **fallback** for nouns, verbs and adjectives whose `forms` list is empty: regular forms by rule — noun: `-s`, `-es` after s/x/z/ch/sh, `y→ies` after a consonant; verb: `-s`/`-es`, `-ed` (`-d` after e, `y→ied`), `-ing` (drop a final silent e); adjective: `-er`, `-est`. No consonant doubling. A fallback form is kept only if it occurs in the frequency list, so no invented forms are shipped.
2. For each distinct form, the **winner** is the candidate lemma with the smallest rank (the most common reading).
3. Emit:
   - winner is a common word (rank ≤ 1,000) → `[form, ""]`;
   - winner is a list word and `form ≠ winner` → `[form, winner]`;
   - winner is a list word and `form = winner` → no row (the word table answers it).

   So "bore" → `""` (the common verb "bear" wins and the token is ignored), "strode" → "stride", "colour" → "color".
4. Build test: a fixture of about 200 hand-checked pairs (irregular verbs, irregular plurals, spelling variants, ambiguous forms) must resolve as expected.

*On the phone (`WordList.resolve`, per distinct token):*
1. `forms.get(token)` → hit: the lemma, or `""` = common.
2. else `words.get(token)` → hit: the token is a list lemma.
3. else: absent from the result = not in the lists.

`ImportService` normalises tokens before calling `resolve` and handles compounds (§7.1, steps 5–6). Known trade-off: when a form belongs to both a common and a rare word, the rare reading is ignored. Such a word can still be added by hand (D8).

---

## 7. Logic in detail

### 7.1 Import pipeline (Epic B)

Runs in a Web Worker that hosts `core` + adapters; the UI only receives progress events, the preview and the result. `analyse` performs steps 1–8 and stores an `ImportDraft`; `confirm` performs step 9.

**1. Read.** `EpubReader`: unzip, `META-INF/container.xml` → OPF → spine order → XHTML → blocks, plus the table of contents. Text of external links is removed (B14).

**2. Remove repeated blocks (B14).** If the book has ≥ 10 sections: drop every block whose whitespace-normalised text occurs in more than half of the sections (watermarks, running headers).

**3. Chapters and works (B11, I1).**
- *With a table of contents* (≥ 3 entries pointing into the spine):
  - Consider only the first entry that points at each section (fragments are ignored; a chapter is at least one spine section).
  - An entry of the top depth that has child entries is a **work**; its children are that work's chapters. A top-depth entry without children is a chapter; if the book has works, it forms a work of its own with the same title.
  - A section that no entry points at joins the chapter before it. Sections before the first entry join the first chapter.
  - Text between a work's entry and its first child chapter: under 300 word tokens → joins that first chapter; otherwise it becomes a chapter titled "Opening".
  - If no entry has children, the book has one work, titled like the book.
- *Without a usable table of contents*: one work; walk the sections in order; a section starts a new chapter if the pending chapter already has ≥ 300 word tokens, otherwise it is appended. Chapters are named "Section n".
- Display title: "‹work› · ‹chapter›" when the book has more than one work, else the chapter title.

**4. Chapter kinds and defaults (B12, B13).** By title, case-insensitive, after trimming:
- `frontMatter`, excluded: `cover`, `title page`, `(table of )?contents`, `copyright.*`, `dedication`, `also by.*`, `imprint`.
- `backMatter`, excluded: `about the author.*`, `acknowledge?ments`, `(an )?(extract|excerpt|preview) from.*`, `.* publication`, `newsletter.*`, `e-?book licen[cs]e.*`.
- **Notes**: `(foot|end)?notes`. A notes chapter is not a chapter of its own: each block carrying an anchor that is the target of a link from another section starts a *note*, which runs to the next such block. A note's tokens are inserted into the reading order directly after the block that links to it first, and counted in that chapter. Note text that nothing links to is appended to the last chapter of the same work.
- Everything else is `story`, included.
- A `story` chapter that ends up under 300 word tokens is merged into the next chapter of the same work (or the previous one if it is the last), unless it is the work's only chapter.

**5. Tokenise.** Split blocks into sentences (`Intl.Segmenter` 'sentence') and words ('word', `isWordLike`). Per token, remember whether it is sentence-initial and its original casing. Normalise: NFC, curly → straight apostrophes, lowercase. Then:
- contains a digit → skipped, not counted as a word;
- ends in `'s` or `s'` → strip that ending;
- still contains an apostrophe (contractions like "didn't", "they'd", dialect like "'em") → counted as a common word, never listed or unlisted;
- written in capitals only, length ≥ 2 ("PDF") → name.

**6. Match (B4).** `WordList.resolve` on the distinct tokens, in batches of 2,000. A hyphenated token that is not found as a whole is split at the hyphens and each part is matched as its own token; if no part is a list word and not all parts are common, the whole token is one unlisted word. A token (or part) that is not found gets one more try as its American spelling (`americanVariants`: -ise→-ize, -yse→-yze, -our→-or, -re→-er, -lled/-lling→-led/-ling); the forms table lacks many British -ise forms, so "realising" would otherwise be an unlisted word next to "realize".

**7. Names (B5).** A lemma (listed or not) is a name if at least 90 % of its occurrences that are not sentence-initial are capitalised, with at least one such occurrence. Unlisted words seen only sentence-initially and capitalised are names too.

**8. Aggregate and preview.** Per lemma: forms, occurrences, `occurrencesByChapter`, `firstPosition` (reading-order token index, B10), example sentence (B9: the sentence of the first occurrence if it has 8–25 words, else the first such sentence, else the first occurrence cut to 25 words around the word). Common words are only counted. Build the `ImportPreview` by running the classification of step 9 without saving.

**9. Confirm: classify and save.** For every lemma of the draft, the first matching rule decides `BookLemma.kind`:

| # | Condition | kind | Card? |
|---|---|---|---|
| 1 | name (step 7) | `name` | no |
| 2 | not a list word, or content rule 4 of §6.3 | `unlisted` | no |
| 3 | `rank ≤ cutoffRank` | `belowLevel` | no |
| 4 | in the global known words | `known` | no |
| 5 | cognate flag and `settings.skipCognates` | `cognate` | no |
| 6 | otherwise | `card` | yes, `active`, content by §6.3 |

A lemma that only occurs in excluded chapters gets its kind but no card. One `UnitOfWork` saves the `Book`, all `BookLemma` rows and the cards, and deletes the draft.

**`reapplyFilter` (B3, H4)** re-runs step 9 from the stored `BookLemma` rows with a new cutoff or chapter selection. It creates missing cards and deletes cards that no longer qualify, but never touches a card that has review history, was edited, has `origin: 'manual'`, or has status `known`/`removed`.

**Adding by hand (D2, D8)** — `CardService.addWord(bookId, typed, translations)`:
1. Normalise `typed` like a token (step 5) and match it (step 6) → `lemma`; if unmatched, `lemma` = the normalised text.
2. If a card `${bookId}:${lemma}` exists: set it `active`, replace its translations, done.
3. Else, if a `BookLemma` exists: create the card from its forms, occurrences, position and example, and set the row's kind to `card`.
4. Else (not in the book): `occurrences = 0`, `chapterIndex` = the chapter currently in state `learning` (or the last included chapter), `firstPosition` = one less than the smallest `firstPosition` among that chapter's unseen cards, so it comes up next.
5. In all cases `origin: 'manual'`, `translationSource: 'manual'`, `listLevel` from the list if the word is listed.

`suggest` performs step 1 and returns what the lists and the book know about the word, without changing anything.

### 7.2 Scheduler (C3, C4) — jMemorize-style Leitner

```ts
interface SchedulerConfig {
  baseIntervalDays: number;   // default 1
  factor: number;             // default 2  → 1, 2, 4, 8, 16, 32, 64 days
  maxLevel: number;           // default 8  (level 8 = "mastered")
  requeueGap: number;         // default 5  (failed card returns after 5 other cards)
}

function grade(card: Card, result: 'known' | 'unknown', now: Date, cfg): Card {
  if (result === 'known') {
    const level = Math.min(card.level + 1, cfg.maxLevel);
    const days  = cfg.baseIntervalDays * cfg.factor ** (level - 1);
    return { ...card, level, dueAt: addDays(startOfDay(now), days).toISOString() };
  }
  return { ...card, level: 0, dueAt: undefined };   // back to box 0 (jMemorize behaviour)
}
```

Pure function, unit-tested with a fake `Clock`. Strategy interface `Scheduler` allows switching to SM-2 or FSRS later without UI changes. (Card *level* here is the learning box 0–8; *list level* 1–10 is the word's rarity. The UI calls the first "box".)

**First-sight retirement (C18)** is decided in `StudyService.grade` before the scheduler is called:

```ts
const firstSight = card.stats.correct === 0 && card.stats.wrong === 0;
if (result === 'known' && firstSight && settings.retireOnFirstTry) {
  // one UnitOfWork:
  //   card.status = 'known'; level and dueAt unchanged (0 / undefined)
  //   knownWords.addMany([card.lemma])
  //   session.counters.alreadyKnown += 1        (not reviewed, not correct)
  //   session.undo = snapshot incl. { addedKnownWord: card.lemma }
  //   refill the queue (§7.3, step 3); no ReviewLog entry, no AchievementService.onGrade
  // SessionView.retired = true
}
```

`undo` of such a grade restores the card and the queue and calls `knownWords.remove(lemma)`.

### 7.3 Building a session queue

The cards of one book are loaded into memory for this (a few thousand objects), so no extra indexes are needed.

1. **Reviews**: all `active` cards with `level > 0 && dueAt ≤ now`, oldest due first, from any chapter.
2. **New cards**: up to `dailyNewLimit − newIntroducedToday`, where `newIntroducedToday` is the number of cards whose first grade was given today. Retired cards (C18) have no grade and so don't count.
   - Target chapter `c` = `opts.chapterIndex` if given (I4), else the first included chapter whose state is not `ready` and that still has unseen cards (§7.5).
   - Candidates = active, never-graded cards with `occurrencesByChapter[c] > 0 || chapterIndex === c`, ordered by `firstPosition` ascending (B10). This includes words first seen in earlier chapters that were left unlearned, and hand-added words.
   - If chapter `c` has fewer candidates than the remaining limit, continue with the next included chapter, and so on.
3. **Refill**: when a card is retired at first sight, or removed during the session, append the next candidate by the same rule, as long as the daily limit isn't reached.
4. Failed cards are re-inserted `requeueGap` positions later (or at the end if the queue is shorter). The session ends when the queue is empty or the user leaves.
5. After every grade the coverage of the target chapter is recomputed. If it reached the target for the first time (`index ∉ book.chaptersAnnounced`), the index is added there and `SessionView.chapterReady` is set. Cards already in the queue stay; the next session picks a new target chapter.
6. "Study ahead" (C9) adds not-yet-due cards with the nearest `dueAt`, and does **not** promote their level beyond the next interval twice in one day.

### 7.4 Resume anywhere (C5)

- Each user action (`flip`, `grade`, `continueAfterReview`, `undo`, …) is a single `UnitOfWork` transaction that writes the card, the session (queue + `current` + counters), learner stats and the review log entry together. IndexedDB transactions are atomic, so a kill mid-write leaves the previous consistent state.
- The UI awaits the commit, *then* animates the next card in.
- The card side (`phase`) is persisted too, so reopening shows the same side.
- On launch the router calls `study.resumeOrStart(lastBookId)`; `lastBookId` and the last route are stored in a small `appState` record (through a repository, not `localStorage`).
- `visibilitychange`/`pagehide` handlers are a backup only; correctness never relies on them because iOS may kill a backgrounded web app without firing them.
- The calibration check and an import draft are persisted the same way.

### 7.5 Progress metrics (Epics E and I)

- **Coverage** (I2) is a pure function over the book's chapters and cards:

  ```ts
  const isUnknown = (c: Card) => c.status === 'active' && c.level < 2;

  function chapterCoverage(ch: Chapter, cards: Card[]): number {
    const unknown = cards.filter(isUnknown)
                         .reduce((n, c) => n + (c.occurrencesByChapter[ch.index] ?? 0), 0);
    return ch.wordTokens === 0 ? 1 : 1 - unknown / ch.wordTokens;
  }
  // bookCoverage: the same over all included chapters
  // unknownEvery = coverage === 1 ? null : Math.round(1 / (1 - coverage))
  ```

  Everything without an active card counts as known: common words, names, below-level words, cognates, and words not in the lists. That is why the UI labels it "estimated" and shows the not-in-the-lists count next to it (I6).
- **Not in the lists per chapter** (I6): number of distinct `BookLemma` rows of kind `unlisted` with `occurrencesByChapter[index] > 0` and not `ignored`, and the sum of those occurrences.
- **Chapter state** (I3), with `target = settings.coverageTarget` (default 0.98, range 0.95–1): `excluded` if not included; `ready` if `coverage ≥ target`; `learning` if it is the first included chapter that isn't ready; else `upcoming`.
- **Book finished** (G2): the first time all included chapters are `ready`, set `book.finishedAt`.
- **Boxes**: count of cards per learning level (0 … max), rendered as stacked "shelves".
- **Session accuracy** = correct ÷ reviewed (first attempt only, so re-queues don't inflate it).
- **Streak**: consecutive local-calendar days with ≥ 1 completed review; computed from `ReviewLog` in the user's timezone.
- All computed in `ProgressService` from repositories, so a backend can compute them identically.

### 7.6 Achievements (G1–G8)

`AchievementService` is pure and runs inside the same `UnitOfWork` as `grade`, `undo` and finishing a session:

```ts
function onGrade(stats: LearnerStats, card: Card, result: Result): { stats; card } {
  if (result === 'known') {
    const comeback = card.stats.failStreak >= 3;
    const streak = stats.correctStreak + 1;
    return {
      stats: { ...stats, correctStreak: streak, totalCorrect: stats.totalCorrect + 1,
               bestCorrectStreak: Math.max(stats.bestCorrectStreak, streak),
               comebacks: stats.comebacks + (comeback ? 1 : 0) },
      card:  { ...card, stats: { ...card.stats, failStreak: 0 } },
    };
  }
  return { stats: { ...stats, correctStreak: 0 },
           card:  { ...card, stats: { ...card.stats, failStreak: card.stats.failStreak + 1 } } };
}

function newUnlocks(defs, stats, existing: AchievementUnlock[]): AchievementUnlock[]
// for each definition and tier: threshold reached && not yet in `existing` → unlock
```

- After each grade, `ProgressService` checks whether all included chapters of the book are now ready (§7.5). The first time that happens, it sets `book.finishedAt`, adds the book to `booksFinished` and unlocks `ready:<bookId>`.
- First-sight retirements (C18) bypass `onGrade` completely: no streak change, no *Word Hoard* count. They can still complete a chapter or a book, so the check above also runs after a retirement.
- The undo snapshot stores the previous `LearnerStats`, so undo restores counters. Unlocks are kept (never revoked).
- Default definitions live in `core/domain/achievements.ts`. Thresholds are data.
- Unlocks and `LearnerStats` are part of `BackupV1`.

### 7.7 Path to a backend

- Implement `storage-http` with the same repository interfaces, or expose the whole `VocabApp` facade over REST/JSON (every method already takes/returns plain JSON).
- `core` runs unchanged in Node; `WordList` can then be backed by a server database.
- IDs are client-generated and deterministic, timestamps ISO-8601 UTC → straightforward last-writer-wins sync per card.
- `BackupV1` doubles as the initial upload format. It contains books (with works and chapters), `BookLemma` rows, cards, sessions, the review log, known words, the vocabulary profile, achievements and settings, but not the word packs.

### 7.8 Vocabulary calibration (Epic H)

`CalibrationService` is pure apart from the injected `Random`, `WordList` and `ProfileRepository`.

**Model.** The probability that the learner knows a word of rank `r`:

```
P(known | r) = 1 / (1 + exp(k · (ln r − ln r50)))
```

`r50` is the rank at which half of the words are known; `k` is the steepness.

**Sampling a word from a level.** Draw a rank uniformly in the level's range with `Random`; take `WordList.firstAtOrAfter(rank, levelTo)`; accept it if it has only letters a–z, length ≥ 4, a non-empty `de`, no cognate flag, and isn't already in the session. Otherwise draw again (give up on the level after 200 draws).

**Procedure.**
1. Stage 1: 2 words from each of the ten levels (20 words), presented in shuffled order.
2. Fit the model (below) on the 20 answers.
3. Stage 2: take the 4 levels whose geometric midpoint `sqrt(from · to)` is closest to `r50` in `|ln mid − ln r50|`; sample 10 words from each (40 words), shuffled.
4. Fit again on all 60 answers and save the profile with `source: 'calibration'`.

The session is saved after every answer, so it can be resumed (H1).

**Fit** (deterministic grid search for the maximum likelihood):

```ts
function fit(obs: { rank: number; known: boolean }[]): { r50: number; k: number; cutoffRank: number } {
  let best = { ll: -Infinity, lnR50: 0, k: 0 };
  for (let i = 0; i <= 200; i++) {                       // ln r50 from ln 500 to ln 150000
    const lnR50 = Math.log(500) + (Math.log(150000) - Math.log(500)) * i / 200;
    for (let j = 0; j <= 22; j++) {                      // k from 0.5 to 6.0, step 0.25
      const k = 0.5 + 0.25 * j;
      let ll = 0;
      for (const o of obs) {
        let p = 1 / (1 + Math.exp(k * (Math.log(o.rank) - lnR50)));
        p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
        ll += Math.log(o.known ? p : 1 - p);
      }
      if (ll > best.ll + 1e-12) best = { ll, lnR50, k };  // first maximum wins
    }
  }
  const r50 = Math.exp(best.lnR50);
  // cutoff = rank at which P(known) = 0.85
  let cutoff = r50 * Math.exp(-Math.log(0.85 / 0.15) / best.k);
  cutoff = Math.min(Math.max(cutoff, 2000), 60000);
  return { r50: Math.round(r50), k: best.k, cutoffRank: Math.round(cutoff / 100) * 100 };
}
```

**Test vectors** (computed with a reference implementation of exactly this code):

| Answers (rank → known?) | r50 | k | cutoffRank | start level |
|---|---|---|---|---|
| 1500 ✓, 1800 ✓, 2400 ✓, 2900 ✓, 3600 ✓, 4700 ✓, 5600 ✓, 7000 ✓, 8000 ✓, 9500 ✓, 11000 ✓, 14000 ✗, 16000 ✓, 19000 ✗, 22000 ✗, 28000 ✓, 33000 ✗, 41000 ✗, 50000 ✗, 65000 ✗ | 17,667 | 3.5 | 10,800 | 6 |
| the same 20 ranks, all ✓ | 150,000 | 6.0 | 60,000 | 10 |
| the same 20 ranks, all ✗ | 500 | 6.0 | 2,000 | 1 |

The *start level* is the level whose range contains `cutoffRank` (`cutoffRank + 1` for the lower bound). The cutoff sits at the 85 % point on purpose: words just above it are still mostly known, and C18 removes those for one swipe each, while a higher cutoff would hide words the learner doesn't know.

---

## 8. UI design

Mobile-first, one-hand use, thumb zone at the bottom. Light and dark themes. Respect `env(safe-area-inset-*)` for the notch and home indicator.

### 8.1 Screens

```
First run:  Install guide ──► Word-list download ──► Vocabulary check ──► Library

Library ──► Import preview ──► Book overview ──► Study (full screen) ──► Statistics (full screen)
   │                                │                  │
   │                                │                  └──► Edit card sheet ──► back to Study
   │                                └──► Words (not in the lists / active / known / removed / skipped)
   │                                          └──► Add word sheet
   ├──► Achievements
   └──► Settings (word lists, vocabulary level, daily limits, coverage target, first-try
                  behaviour, English definitions, cognates, gesture hints, achievement
                  pop-ups, lookup links, backup, about)
```

**Vocabulary check** (Epic H) — the study card UI with a fixed "12 / 60" counter and a *Skip* link at the top. Result screen:

```
┌─────────────────────────────┐
│      Your English level     │
│                             │
│     You start at level 6    │
│   1 2 3 4 5 ▐6▌ 7 8 9 10    │  levels 1–5 skipped
│                             │
│  Words more common than     │
│  rank 10,800 won't become   │  cutoffRank
│  cards.                     │
│                             │
│  ●────────────○──────────   │  Adjust (2,000 – 60,000)
│                             │
│  [ Use this ]   Repeat      │
└─────────────────────────────┘
```

**Library** — one tile per book: cover, title, coverage ring, current chapter ("Death or Glory · Three · 96.1 %"), "12 due" badge, big *Study* button. Empty state explains how to import. First launch in Safari (not installed) shows a one-time "Add to Home Screen" guide, because iOS has no install prompt.

**Import preview** (B7, B11, B12)

```
┌─────────────────────────────────┐
│  Defender of the Imperium       │
│  Level 6 · 2,140 cards          │
│  estimated coverage now 94.9 %  │
│                                 │
│  ☐ Cover, Contents, Title page  │  front matter, off by default
│  ☑ Sector 13             9,060  │
│  ☑ Death or Glory  ▾   84,300   │  work; expands to its chapters
│  ☑ Duty Calls      ▸   98,700   │
│  ☑ Traitor's Gambit     10,200  │
│  ☑ Cain's Last Stand ▸ 109,800  │
│  ☐ An Extract from 'Baneblade'  │  back matter, off by default
│                                 │
│  1,310 words are not in the     │
│  lists · 580 names skipped      │
│                                 │
│  [      Create 2,140 cards    ] │
└─────────────────────────────────┘
```

(The numbers in this mock-up are illustrative.) Ticking and unticking updates the card count. Footnote sections don't appear; they are folded into their chapters.

**Book overview** — coverage ring for the book (E1) with "about one unknown word every 31 words", then works and chapters (Epic I), boxes (E2), streak flame + daily goal ring (E4). Buttons: *Study now*, *Words*.

```
┌─────────────────────────────────┐
│  Defender of the Imperium       │
│  ◔ 96.8 % · one unknown in 31   │  estimated coverage
│                                 │
│  ▾ Death or Glory               │
│  ✓ One       ▓▓▓▓▓▓▓▓│ 98.6 %   │  Ready to read
│  ✓ Two       ▓▓▓▓▓▓▓▓│ 98.1 %   │  Ready to read
│  ● Three     ▓▓▓▓▓▓░░│ 96.1 %   │  Learning · 23 new · 14 not in lists
│    Four      ▓▓▓▓▓░░░│ 95.2 %   │  Upcoming
│  ▸ Duty Calls                   │
│                      ▲ 98 % mark│
│  [        Study now         ]   │
└─────────────────────────────────┘
```

Bars are scaled from 90 % to 100 %, so the differences that matter are visible. Tapping a chapter opens a sheet with its card counts (unseen / learning / learned), its words not in the lists (link), and *Study this chapter* (I4).

**Study (full screen, C10–C14)**

```
 Default                 Swipe down (3 s)        Swipe up
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│                   │   │▓▓▓▓▓▓░░░░░░░ 12/40│   │                   │
│                   │   │                   │   │  ┌─────────────┐  │
│ ┌───────────────┐ │   │ ┌───────────────┐ │   │  │  (dimmed)   │  │
│ │               │ │   │ │               │ │   │  │ relinquish  │  │
│ │  relinquish   │ │   │ │  relinquish   │ │   │  └─────────────┘  │
│ │               │ │   │ │               │ │   │                   │
│ │ "…he would not│ │   │ │ "…he would not│ │   │ ┌───────────────┐ │
│ │  relinquish…" │ │   │ │  relinquish…" │ │   │ │ ✎  Edit card  │ │
│ └───────────────┘ │   │ └───────────────┘ │   │ ├───────────────┤ │
│                   │   │                   │   │ │ ◼ Finish      │ │
│                   │   │                   │   │ │   session     │ │
└───────────────────┘   └───────────────────┘   └─┴───────────────┴─┘
```

- **Full screen**: card centred on a full-bleed background, no visible controls. Front: English word (verbs as "to brood", when `pos[0]` is verb) + context sentence with the word in bold. Back: German translations, the English definition in smaller type, part of speech, box dots.
- **Tap** → 3D flip (300 ms, `rotateY`, `backface-visibility: hidden`).
- **Swipe left/right** → card follows the finger with slight rotation (`x * 0.05deg`); green/red tint with ✓/✗ grows with distance. Past the threshold the card flies off and the next one scales up from the deck behind. A small "Undo" pill appears near the bottom for 3 s (C6); after a first-sight retirement it reads "Already known · Undo" (C18).
- **Lookup links (C16)** → every back side ends with the link row. A wrong swipe on the front (only with *Flip before grading* off) swings the card back, showing its back side with a red edge:

```
┌───────────────────────┐
│  ┌─────────────────┐  │
│  │ ✗ relinquish    │  │  red top edge = answered wrong
│  │                 │  │
│  │ aufgeben,       │  │
│  │ verzichten auf  │  │
│  │                 │  │
│  │ "…he would not  │  │
│  │  relinquish…"   │  │
│  │ ─────────────── │  │
│  │ Wiktionary  ↗   │  │  44 px tap targets,
│  │ dict.cc ↗ LEO ↗ │  │  horizontally scrollable chip row
│  │ Linguee ↗ Cam.↗ │  │
│  └─────────────────┘  │
│   tap or swipe to     │
│      continue         │
└───────────────────────┘
```

  Links are real `<a href target="_blank" rel="noopener noreferrer">` elements. The gesture recogniser ignores pointer-downs that start on a link.
- **Top bar** → a 3 px progress bar (session done/total, accent colour), a tiny "12 / 40" label and a *Finish* text button (44 px), always visible under the status bar. User feedback: hidden progress and a hidden way out felt like no progress and no way out.
- **Swipe up** → bottom panel with two 56 px-tall buttons, *Edit card* and *Finish session*; card dims to 40 %. Swipe down or tap the card to dismiss.
- **Edit card sheet** → full-screen: word, translation chips (editable, add/remove), *Save*, then destructive actions *Remove card* and *Mark as known* (each confirmed via an undo toast rather than a dialog), *Cancel*.
- **Gesture hints (C15)** on the first card of a session:

```
 Before flip                     After flip
┌───────────────────────┐       ┌───────────────────────┐
│━━━─────── 0/40 Finish │       │━━━─────── 0/40 Finish │
│                       │       │                       │
│  ┌─────────────────┐  │       │  ┌─────────────────┐  │
│  │   relinquish    │  │    ✗ ◀│  │   aufgeben,     │  │▶ ✓
│  │                 │  │  didn't  │   verzichten    │  knew
│  │   ◉ tap to flip │  │   know│  │                 │  │ it
│  └─────────────────┘  │       │  └─────────────────┘  │
│                       │       │                       │
│     ↑ edit card       │       │     ↑ edit card       │
└───────────────────────┘       └───────────────────────┘
```

  Short looping animations in white on a 50 % dark scrim around the card; the card itself stays fully visible. Hints are a UI-only concern: the UI decides from `SessionView.counters.reviewed === 0` and a setting.
- **Gesture engine**: one Pointer Events recogniser on the stage (`touch-action: none`), axis locked after 10 px, vertical gestures ignored if they start within 44 px of the top or bottom edge. `prefers-reduced-motion` replaces flips/flings with fades.
- **Accessibility (C7)**: the card is a VoiceOver element with custom actions (*Flip*, *Knew it*, *Didn't know*, *Card options*); keyboard: Space = flip, ←/→ = grade, ↑ = panel, ↓ = close panel, Z = undo.

**Statistics (full screen, C14)** — scrollable, three sections:
1. *This session*: big first-try accuracy ring, cards reviewed, "8 cards moved up a box" (animated), cards removed, time spent. If cards were retired at first sight: "14 words you already knew were removed".
2. *Overall*: coverage of the current chapter and of the book with the change from this session ("Death or Glory · Three: 96.1 % → 97.0 %"), cards per box, words not in the lists (link), streak flame and daily goal ring, words learned across all books.
3. *Achievements unlocked* (G6): medals earned this session, revealed one by one; gold tiers get confetti.

Buttons at the bottom: *Study more* and *Done* (back to Book overview). Milestone celebrations (E5) play here, not during study.

**Achievement pop-up** (G4) and **chapter-ready banner** (I3) — the same component, sliding in from the top for 5 s; a tap dismisses it:

```
┌─────────────────────────────┐
│ ┌─────────────────────────┐ │
│ │ 🥈  ON A ROLL · SILVER   │ │   or:  📖 Death or Glory · Three
│ │     10 correct in a row  │ │        is ready to read · 98.2 %
│ └─────────────────────────┘ │
```

**Achievements** (G5): a grid of medal tiles. Unlocked tiers in colour (bronze `#B0753B`, silver `#A8B0B8`, gold `#D4A72C`) with the unlock date; locked ones greyed out with a progress bar and "87 / 100". Each *Ready for ‹title›* badge shows the book cover.

**Words** (Epic D) — segmented control: *Not in the lists · Active · Known · Removed · Skipped*, a search field, a chapter filter and a "+" button.

```
┌─────────────────────────────────┐
│  Words                      ＋  │
│ [Not in lists] Active Known …   │
│  🔍 search        Chapter: all  │
│                                 │
│  lasgun            ×212   One   │
│   "…levelled his lasgun at…"    │
│  hellgun            ×48   Two   │
│  promethium         ×31   One   │
│  ☐ Show names (580)             │
└─────────────────────────────────┘
```

- *Skipped* shows what the filter left out on purpose (below your level, cognates), each with *Add as card*.
- Swipe a row left → *Remove* (cards) or *Ignore* (not in the lists), with an undo toast.

**Add word sheet** (D2, D8, D9)

```
┌─────────────────────────────────┐
│  Add a word                     │
│  [ promethium              ]    │  editable when opened via ＋
│  appears 31× · not in the lists │  live status from `suggest`
│  "…a tank of promethium…"       │
│                                 │
│  Translation                    │
│  [ Promethium (Brennstoff)  ]   │  prefilled if the word is listed
│                                 │
│  Wiktionary ↗ dict.cc ↗ LEO ↗   │  lookup links
│                                 │
│  [  Add card  ]      Ignore     │
└─────────────────────────────────┘
```

### 8.2 Motivation design

- **Coverage** is the hero metric: per chapter it directly answers "can I start reading this yet?". "One unknown word every 38 words" makes the number tangible.
- **Chapters turning green** one after another give a visible path through the book.
- **List levels**: cards show their list level, and the statistics show "words learned per level", so rare words feel like harder trophies.
- **Boxes visual**: cards physically move up shelves; promoted cards animate upward in the summary.
- **Streak flame** and a **daily goal ring** (default 20 reviews).
- **Milestone celebrations**: lightweight confetti (canvas, about 2 s, large pieces) when a chapter becomes ready, when the whole book reaches the coverage target, at a new longest streak, and at the first 100 % accurate session. Only for what the session itself did: a session ended without grading a card never celebrates, even if coverage rose meanwhile through a re-filter or the Words screen.
- **Copy**: always positive and specific ("You know 412 of this book's 1,180 rare words").
- Haptics: Android via `navigator.vibrate` (short tick on grade); iOS Safari doesn't support it, so visual feedback carries the effect there.

---

## 9. iOS-specific notes

- Manifest `display: "standalone"`, `apple-touch-icon`, `apple-mobile-web-app-status-bar-style: black-translucent`, splash images.
- "Full screen" study is achieved by the app layout, not the Fullscreen API (which iPhone Safari only supports for video). With `black-translucent` the page draws under the status bar; the study background extends edge to edge while the card and overlays respect `env(safe-area-inset-*)`. The status bar clock stays visible, which is an iOS limit.
- iOS reserves swipes from the top edge and bottom edge, so in-app vertical swipes must start away from the edges. `overscroll-behavior: none` on the study screen prevents rubber-banding.
- Storage: request `navigator.storage.persist()` where supported; still assume storage can be lost under device storage pressure → backup export (F1) is a Must, with a gentle reminder after every 7 days of study without an export.
- File picker: `<input type="file" accept=".epub,application/epub+zip">` (both, because iOS sometimes greys out files when only the MIME type is given).
- Data entered in a Safari tab doesn't carry over to the installed app → the install guide appears before the word-list download.
- Service worker precaches the app shell; the word packs are stored in IndexedDB, not the Cache API.
- Test on real devices: iPhone (current and one older iOS version), plus one mid-range Android with Chrome.

---

## 10. Project layout

```
/
├─ apps/pwa/                 Svelte UI, service worker, manifest, worker entry
├─ packages/core/            domain, services, ports, createApp()
├─ packages/storage-idb/     Dexie schema + repository implementations
├─ packages/epub-browser/    JSZip + DOMParser EpubReader
├─ packages/word-packs/      pack download, verification, WordList implementation
├─ tools/build-word-packs/   builds the three packs from public sources (Node, CI)
├─ fixtures/                 small EPUBs and a miniature word pack for tests
├─ README.md
└─ LICENSES.md               third-party data and code attributions
```

### IndexedDB schema (Dexie, v1)

```ts
db.version(1).stores({
  books:        'id',
  cards:        'id, bookId, [bookId+status], lemma',
  bookLemmas:   '[bookId+lemma], bookId, [bookId+kind]',
  importDrafts: 'id',
  sessions:     'id, [bookId+state]',
  reviewLog:    '++seq, at, cardId, bookId',
  knownWords:   'lemma',
  achievementUnlocks: '[achievementId+tier], unlockedAt',
  words:        'lemma, rank',     // words-en-de
  wordsFreedict:'lemma',           // words-de-freedict
  forms:        'form',            // forms-en
  packChunks:   '[packId+file]',   // which chunks are installed, for resumable download
  meta:         'key'              // appState, pack info, settings, vocabulary profile,
                                   // calibration session, learner stats
});
```

---

## 11. Testing

- **core**: Vitest unit tests with in-memory repository fakes and a miniature `WordList` fixture (about 300 words, 600 forms).
- **Scheduler**: property tests (levels never exceed max, failed → level 0, due dates monotonic in level).
- **Calibration**: the three fit vectors of §7.8 must reproduce exactly; with a seeded `Random`, stage 2 picks the four levels nearest to `r50`; no sampled word is a cognate.
- **Matching**: tokens → lemma for irregular forms, spelling variants, a form whose winner is a common word, possessives, contractions, hyphenated compounds (whole found / parts found / unlisted), capitals-only tokens.
- **Chapters**: fixtures for a two-level table of contents with repeated chapter names, a flat one, none at all; untitled sections join their chapter; front and back matter are excluded by default; short chapters are merged.
- **Footnotes**: a note's words are counted in the linking chapter and positioned after the linking block; unlinked note text goes to the work's last chapter.
- **Watermark**: a block repeated in more than half of the sections and the text of external links produce no tokens.
- **Classification**: one test per row of the table in §7.1 step 9, and the preview counts add up.
- **Adding by hand**: an unlisted book word, a below-level list word, an inflected form, a word that isn't in the book, an existing removed card; `reapplyFilter` keeps all of them.
- **Coverage**: a hand-built book of 2 chapters × 100 word tokens with known card occurrences → exact coverage values, state transitions at the target, "ready" announced once, unlisted counts per chapter.
- **First sight**: right swipe on a new card retires it, adds the known word, refills the queue, leaves achievements untouched; undo reverses all four.
- **Resume**: kill the worker between `grade` steps and assert state consistency.
- **Pack builder**: the 200-pair forms fixture of §6.4; cognate flag examples; the sanity check of §6.3 rule 8.
- **UI**: Playwright with WebKit and mobile viewports for flip, swipe thresholds, undo, resume after reload, import preview, add word.

---

## 12. Milestones

1. **M1 Core**: domain model, scheduler, first-sight retirement, session queue with chapters, coverage, calibration, achievements, import pipeline on in-memory `EpubContent` with the fixture word list, adding by hand; unit tests.
2. **M2 Data**: pack builder (word table, FreeDict supplement, forms table), pack download, IndexedDB adapters, EPUB reader, import in a worker.
3. **M3 Study**: first-run flow with vocabulary check, study screen with flip/swipe, wrong-answer review, resume, statistics.
4. **M4 Manage**: import preview, book overview with works and chapters, words screen with add sheet, settings.
5. **M5 Motivation & polish**: boxes, streaks, achievements, banners, celebrations, backup, install guide, iOS device testing.

---

## 13. Implementation guide

This section is for whoever (human or coding agent) implements the app.

**Ground rules**
- Follow the milestones in order. Each ends with all tests green and `core` free of DOM and adapter imports (§4, rules 1–2).
- Where a section gives code, a table or numbered rules (§6.3, §6.4, §7.1–§7.3, §7.5, §7.6, §7.8), implement it as written. The acceptance criteria in §2 are the definition of done for each story.
- Everything in `core` takes its dependencies through `createApp(ports)`. No singletons, no `Date.now()`, no `Math.random()`.
- Every mutating `VocabApp` method runs in exactly one `UnitOfWork`.

**Suggested order inside M1** (each step is test-first)
1. Types of §5 and ports of §4.1; in-memory implementations of all repositories, of `UnitOfWork` and of `WordList` (from the fixture).
2. `scheduler.grade` (§7.2) and `AchievementService` (§7.6).
3. `CalibrationService.fit` with the vectors of §7.8, then sampling and the two-stage procedure.
4. `ProgressService`: coverage, chapter states, book finished (§7.5).
5. `ImportService`: steps 2–9 of §7.1 on hand-built `EpubContent`, then `reapplyFilter`.
6. `CardService`: `suggest`, `addWord`, unlisted listing, remove/restore/known.
7. `StudyService`: queue building (§7.3), flip, grade, first-sight retirement, wrong-answer review, undo, edit/remove current, finish.
8. `createApp` facade and `BackupV1` export/import round-trip.

**Decisions already taken** (don't reopen during implementation)
- Only list words become cards automatically; everything else needs a manual add.
- Word forms are matched by exact lookup in the shipped table; no stemming on the phone.
- When a form belongs to several lemmas, the most common lemma wins.
- Words not in the lists are left out of coverage and shown as a separate count.
- Cutoff at the 85 % point of the fitted curve; 8,000 when the check is skipped.
- "Learned" for coverage means box level ≥ 2. A chapter is ready at the coverage target, not when all its cards are learned.
- The Wiktionary and FreeDict packs are never merged into one file or store.

**To verify while building** (assumptions this design could not check)
- The Wiktextract field names, how complete its `forms` lists are, and the real pack sizes (§6.3, §6.4). Adjust the builder, not the pack formats.
- Analyse time on a real iPhone with the 330,000-word test book; if it exceeds 20 s, raise the batch size before changing the pipeline.
- The quality of the result on a real book: number of cards per level, how many useful words end up "not in the lists", and whether the top level needs to reach beyond rank 100,000.
- Whether 60 calibration words give a stable cutoff: run the check twice with different seeds on one person; the two cutoffs should differ by less than about 25 %. If not, raise stage 2 to 60 words.

**Findings from a test book** (a 330,000-word science-fiction omnibus, structure analysed only; no word lists were available for that test)
- 130 spine sections; two-level table of contents with 12 top-level entries and 83 chapters; chapter names "One", "Two", … repeat in each of three novels → works (B11).
- 28 untitled interlude sections between chapters; a 3-word story title whose 9,000-word body is an untitled section → sections without an entry join the chapter before them.
- Four "Footnotes" sections (about 10,900 words) reached by 315 links from the chapters → B13.
- A download-site name injected into all 130 sections as an external link → B14.
- 58 contraction forms and 747 hyphenated forms → steps 5 and 6 of §7.1.
- 576 name candidates covering about 5 % of the text, including ordinary words the setting capitalises ("Emperor", "Chaos") → acceptable.
- 38 % of the distinct word forms occur only once.

---

## 14. Open questions

- Which frequency list to use for ranking (licence vs. quality)? Default proposal: one built from `wordfreq` data.
- Invented words of a fictional setting ("lasgun") are never in the lists. They show up at the top of *Not in the lists* because they are frequent; is that enough, or should the most frequent ones be offered at import?
- Later improvements that were assessed but not included yet: learning the cutoff continuously from swipes, hiding derived forms of easy words ("unhappiness"), choosing the sense that fits the sentence, prioritising recurring words within a chapter, a compressed schedule before a planned reading date, and multi-word expressions.
