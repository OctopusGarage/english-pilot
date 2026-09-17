# Daily Review Lifecycle Design

## Goal

Make the automated daily review useful under a large historical backlog while allowing newly captured, high-quality material to appear promptly. The system must remove low-value records automatically without treating message delivery as proof that the learner reviewed or mastered an item.

## Scope

This change covers learning-item admission, automated retention cleanup, daily chat selection, delivery reporting, and tests. It applies to the compact Feishu daily review and to shared selection logic that other delivery channels can reuse.

It does not add interactive review buttons, change the `again`/`hard`/`easy` spaced-repetition algorithm, or infer learning outcomes from successful message delivery.

## Strategy

### 1. Admission quality gate

Before inserting a learning item, apply the same deterministic quality rules used by retention cleanup. Reject:

- normalized duplicates;
- empty originals or suggestions;
- unchanged rewrites;
- generic fallback rewrites that do not teach a meaningful expression;
- trivial greetings or fragments with insufficient learning value;
- task-like content that exceeds the configured review length limit.

Rejected input returns the existing matching item when it is a duplicate. Other rejected input is not persisted and must produce a structured reason at the boundary that requested recording.

### 2. Automatic retention cleanup

Before scheduled daily delivery, classify stored items with a pure cleanup planner. Permanently delete:

- all items classified as low quality by deterministic cleanup rules; and
- never-reviewed items that are at least 60 days old and still overdue.

An item is protected from age-based deletion when `reviewCount > 0` or `lastReviewedAt` is present. Low-quality classification can delete a reviewed item because unusable content should not remain in the learning collection.

Cleanup runs before selection so deleted records cannot consume daily capacity. Deletion is idempotent. A cleanup summary records examined, low-quality-deleted, stale-deleted, protected, and remaining counts without logging full private learning text.

### 3. Balanced daily selection

Select at most 12 quality-approved items from three cohorts:

- **Newly due: 4 slots.** Never-reviewed items created recently, newest first.
- **Reviewed and due: 4 slots.** Items with prior review history, most overdue first, with lapses breaking ties ahead of easier items.
- **Backlog: 4 slots.** Remaining never-reviewed overdue items, rotated deterministically across days.

Unused slots spill into the other cohorts rather than reducing the message size. Spill order is reviewed-and-due, newly-due, then backlog, while preserving uniqueness.

“Created recently” means within the previous 14 calendar days relative to the requested review date. Items scheduled after the requested date are never selected.

### 4. Deterministic rotation

Backlog selection uses a stable daily offset derived from the review date and the ordered eligible backlog. Consecutive dates therefore expose different backlog windows without mutating learning progress. Given the same date and database state, selection is reproducible for retries.

Delivery success does not update `reviewCount`, `lastReviewedAt`, `intervalDays`, or `nextReviewAt`. Only explicit `again`, `hard`, or `easy` outcomes update spaced-repetition state.

### 5. Delivery lifecycle and reporting

The scheduled delivery flow becomes:

1. load stored learning items;
2. plan and execute automatic cleanup;
3. reload remaining items;
4. select a balanced review set;
5. format and deliver messages;
6. return cleanup and cohort-selection counts with the delivery result.

If cleanup fails, delivery fails closed and reports a sanitized blocker instead of sending a potentially repetitive pack. If notification fails, cleanup remains committed because it is an independent retention operation; a retry for the same date produces the same selected items from the remaining state.

Manual preview and dry-run commands remain non-mutating. Automatic cleanup occurs only on real scheduled/direct delivery, not while building a pack or checking readiness.

## Module Boundaries

- `core/review-quality`: pure admission and retained-item classification.
- `core/daily-review-selection`: pure cohort allocation and deterministic rotation.
- `storage/repository`: batch deletion API and persisted-item operations.
- delivery orchestration: cleanup transaction, reload, selection, formatting, notification, and summarized result.

Formatting remains separate from selection so chat-size limits do not influence which learning items are considered pedagogically valuable.

## Configuration

Use named defaults in code:

- maximum daily items: 12;
- cohort target: 4/4/4;
- recent window: 14 days;
- stale never-reviewed retention: 60 days;
- maximum original or suggested length: 220 characters.

This iteration does not add user configuration. The constants live beside the pure policy functions so later configuration does not require changing delivery code.

## Compatibility and Migration

No schema migration is required. Existing review metadata is sufficient. The first real delivery after deployment may delete a large number of low-quality or stale never-reviewed records; the returned summary makes that action visible.

Existing manual `review cleanup` behavior continues to work and should share classification rules where practical. Existing explicit review commands and scheduling semantics remain unchanged.

## Testing

Unit tests must establish:

- low-quality admission rejection and valid admission acceptance;
- cleanup classification, including reviewed-item age protection;
- exact 4/4/4 selection when all cohorts have capacity;
- slot spillover when one or more cohorts are undersized;
- deterministic same-day results and different consecutive-day backlog windows;
- exclusion of future-due and low-quality items;
- delivery does not mutate spaced-repetition outcomes;
- dry runs and previews never delete records;
- real delivery reports cleanup and cohort counts;
- cleanup failure prevents notification.

Integration tests must cover repository deletion, real CLI delivery orchestration with injected notification, and compatibility with existing review commands. The deterministic smoke suite and MCP stdio smoke must pass before completion.

## Success Criteria

- Newly due content appears in the next eligible daily review when the recent cohort has capacity.
- A large old backlog cannot occupy all 12 daily slots.
- Consecutive review dates rotate backlog items without changing learning outcomes.
- Low-quality and stale never-reviewed records are removed automatically during real delivery.
- Reviewed records survive age cleanup unless independently classified as low quality.
- Preview paths remain read-only.
- Delivery results explain what was cleaned and selected without exposing complete stored text.
