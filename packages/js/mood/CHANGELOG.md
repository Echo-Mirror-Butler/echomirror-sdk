# @echomirror/mood

## 0.1.1

### Patch Changes

- 56fa6a4: Configure Changesets release automation and publishing path to npm.
- Updated dependencies [56fa6a4]
  - @echomirror/core@0.1.1

## 0.1.0 — 2026-08-19

### Added

- Initial release of `@echomirror/mood`
- `logMood(client, entry)` — record a mood entry (score 1–10, optional note and tags)
- `getMoodHistory(client, options)` — paginated mood history with date-range filtering
- `getMoodStreak(client)` — current and longest daily-logging streak
- `getAIReflection(client, entryId)` — fetch the AI-generated reflection for a mood entry
- `deleteMoodEntry(client, id)` — remove a mood entry by ID
- Full type coverage with `MoodEntry`, `MoodStreak`, `MoodHistoryOptions`
