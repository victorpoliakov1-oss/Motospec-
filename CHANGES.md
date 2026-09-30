# MotoSpec – changes

## 30 Sep 2026 – online lookup and store links

### Online lookup (bikes not in the built-in list)
- Cause of the empty page: a later edit made the server fill in an EMPTY spec sheet
  whenever Gemini's answer came back incomplete, instead of reporting a problem.
  A second cause: when Gemini wrote a citation like "[1]" before its JSON, the old
  reader grabbed "[1]" instead of the answer.
- New `server/normalize.ts` reads Gemini's answer whatever its shape: prose around it,
  renamed fields ("specifications", "known_issues"), nesting, "N/A" values, citations.
- New `server/lookup.ts`: if the Google Search answer is incomplete, a second Gemini pass
  with a strict JSON schema fills it in. If that fails too, the rider gets a clear
  message, never a blank page.
- Typos get "Did you mean …?" with a one-click button. If the bike isn't found, the
  parts column waits instead of showing unrelated parts.
- Friendly messages for usage limits, timeouts and a missing API key.
- Gemini instructions use format descriptions, not example numbers the model could copy.
- 2-minute time limit on the app side, so a lookup can never spin forever.

### Store links
- J&P Cycles: search uses `?query=` (the old `?q=` was ignored by J&P). Tested on the live site.
- RevZilla: `server/revzilla.ts` finds RevZilla's page for the bike
  (e.g. revzilla.com/parts/2014-harley-davidson-road-king-flhri), checks it's real
  and the same bike, and reads RevZilla's bike number from it. Part buttons then open
  RevZilla with the rider's bike already selected (`&vehicle_id=`). Tested on the live site.
- New "Shop every part that fits your <bike>" link to RevZilla's bike page.
- If RevZilla's page can't be found (or RevZilla blocks the check), buttons fall back
  to a plain part search.
- Saved parts remember the bike number.
- Google Shopping removed (its link format was never tested).

### Publishing
- Restored the build/start commands. `node server.ts` crashes on start
  (ERR_MODULE_NOT_FOUND), which would have broken the published app.

## Earlier (29 Sep 2026)
- Redesign: single search, compact part cards, known issues near the top, honest labels.
- Built-in bike data only matches the exact bike and generation.
- Google Search grounding switched on; stable part IDs; PDF library loads on demand.
