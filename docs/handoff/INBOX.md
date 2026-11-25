# INBOX — tasks and decisions for agents

From the owner or chat Claude. Newest on top. Each entry is dated and has a
status: open / in progress / done. See `.claude/skills/mappal-context/SKILL.md`
→ "Handoff protocol".

## 2026-11-25 — Reading: word management in the backend, parent mode, cached games — in progress (owner: "Go, build it")

Owner: a parent mode to manage words (scrollable list with photo, word, status Naujas / Mokomės / Extra pamokos / Išmokta, difficulty Lengvas / Vidutinis / Sunkus, a grade a kid understands such as 1–3 suns or a not-too-cool bomb, lesson count); check and add words; see suggested photos, flag "needs a better photo", upload or take a photo; mark a word not OK; listen to the word, letter by letter and by syllable in all three voices played in sequence, tap to choose, replay, record your own; approve (photo + voice) → Mokomės; adjust every status and grade. Must work with one word. Any interface; stored in the backend; games cache heavily, work offline and auto-update; the same words for all games. Design: `domains/reading/DESIGN.md`.

## 2026-11-21 — Contract v2: score + like/dislike hints, complication flags; index cells on the map — done

Owner: "I added this rule. Extend contracts — 5. Evaluate location based on provided like and dislike hints. Use 0–100 score where 0 is go-go, 50 undecided and 100 is a must." Then: "Also add meta data requirement for flag complications. For example restaurant in super market is complication as its harder to reach. Restaurant in old town with banned car traffic or places that do not allow dogs." Then: "What is cell? Can you show them on map? Make them hidable." Report: STATUS.md, same date.

## 2026-11-21 — Readable fonts, nested use cases, tree filter, manual run — done

Owner (with a phone screenshot of Config): "Fonts are unreadable. Make location prompts nestable. Like I want to have Food and then fast food, cool bars and other subtypes. In browse I want to be able to filter by this structure so i can see only food places when i need food, not random museums." Then: "Also add 'manual run' option where you give full payload I have to paste to any agent based on use case and I would be able to paste results to save." Report: STATUS.md, same date.

## 2026-11-21 — Brief pipeline + one app with Config / Browse / Swipe — done

Owner: indexing as a pipeline — master prompt (charter), output format, location data, use-case rules, known locations as a negative prompt (so "more" in a big city never repeats), each step deterministic; the local agent gets full tasks at once from the API/MCP; an API for the agent to pull and change rules, versioned and stored; "Build pipeline"; a control to say when to reindex; a web app for iPhone and desktop with three modes: config (all prompts), browse (what's indexed, voting), the Tinder thing. Report: STATUS.md, same date.

## 2026-11-21 — Agent fixes after the owner's review — done

Owner: location must combine many hints (car GPS is one of them; shared links, history, a pin) into a good-enough guess; a stored place index instead of live Overpass per run (15 or 100 km should be nothing); replace the token ("no questions asked"); merging without asking is fine; a measured budget log (tokens vs the weekly %), no guessing; a debug view with a correlation id that shows on a map what was guessed, indexed, checked and what it cost. Report: STATUS.md, same date.

## 2026-11-21 — Review app (swipe per person + map) — done

Owner: Tinder-style review of the agent's places, like / undecided / don't like / never, per name (e.g. owner and partner vote separately), a filter first (area around me or a pin, 20/50 km, kind, whose votes, "see way more"), a map mode with votes, sent-to-car links and places actually visited (GPS), desktop for planning; "start with phone version"; later: browse the backlog and per-category settings, and see whether the agent has indexed an area. Report: STATUS.md, same date.

## 2026-11-21 — Hybrid agent Phase 0: cost test (cafes + exploration at the latest known location) — done

Owner: "build Phase 0 … keeping one location under 5% of my weekly allowance. Show me your plan and cost estimate before you write any code." Plan: docs/PLAN.md → "Hybrid agent backend — Phase 0". Owner: "Build". Report: STATUS.md, same date. Next for the owner: the first real run from Claude Code with `/usage` before and after.

## 2026-11-20 — Family grocery list (G6) — done

Owner in chat: a shared grocery list for the family's phones — frequent items without retyping, autocomplete, dictation in Lithuanian + English parsed by DeepSeek with the known taxonomy, supermarket-aisle grouping, live crossing-out between phones, long-term purchases that roll over, a skill + basic MCP for Claude/ChatGPT, one token link (no login screen), a removable module with its own table prefix. Decisions from the owner's answers: one editable aisle order, iPhone keyboard dictation, suggestions added with one tap, **same Vercel project as MapPal**. Then: "Do security updates". Report: STATUS.md, same date.

## 2026-11-06 — Phase 4: one-tap map UI — open

Main screen: map (OSM default, Google switchable) + scenario buttons; tap → cached result instantly, else live run with spinner; tiered list over the map, red crosses, nav links, Google preview on tap. Waiting for the owner's go after reviewing the phase 2–3 STATUS entry and trying `/scenarios` on the live app.

## 2026-11-06 — Build phases 2–3 (data model + pipeline v1 for Groceries and Construction stores) — done

Owner: "Can you build now???" plus answers to the open decisions (see DECISIONS.md). Report: STATUS.md, same date.

