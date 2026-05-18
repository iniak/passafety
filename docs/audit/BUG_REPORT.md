# PasSafety — Repository Audit & Bug-Fix Report

- **Repository:** `passafety` (Passafety v3.4.0)
- **Stack:** Tauri 2 · React 18 / TypeScript · Rust (rusqlite, aes-gcm, pbkdf2)
- **Audit date:** 2026-05-18
- **Branch:** `bugfix/repo-audit-2026-05` (cut from `main` @ `983e05a`)
- **Baseline before changes:** `cargo test` 7/7 pass · `tsc --noEmit` clean · `cargo clippy` 2 cosmetic warnings · no build/test failures.

## Executive summary

The codebase is small, cohesive, and in good health — there were **no compile or
test failures and no crypto defects**. The KDF/cipher path (PBKDF2-HMAC-SHA256,
AES-256-GCM, `zeroize`-on-drop, per-entry nonce, atomic re-encrypt on master
change) is sound and was deliberately left untouched.

The defects found are behavioral, security-surface, and documentation issues.
**7 were fixed** (low-risk, verifiable, with tests where applicable). **6 are
documented but intentionally not changed** because they require a product
decision or fall under the project's "no unmigrated changes to crypto-adjacent
paths" rule.

Post-fix verification: `cargo test` **9/9 pass** · `tsc --noEmit` clean ·
`cargo clippy` no new warnings.

---

## Fixed

### BUG-001 — Unused `shell:allow-execute` capability (RCE primitive)
- **Severity:** Medium · **Category:** Security (attack surface)
- **File:** `src-tauri/capabilities/default.json`
- **Root cause:** The capability granting arbitrary command execution via the
  shell plugin was declared, but a full-tree search found no
  `@tauri-apps/plugin-shell` import, no `Command`, and no `execute()` call
  anywhere in `src/`. Dead grant = pure attack surface: any future
  HTML/JS-injection in the webview would gain a command-execution primitive in
  a password manager.
- **Fix:** Removed `shell:allow-execute` from the capability list.
- **Verification:** Frontend builds & type-checks; no code references the
  removed permission.

### BUG-002 — Unused `clipboard-manager:allow-read-text` capability
- **Severity:** Low · **Category:** Security / privacy (attack surface)
- **File:** `src-tauri/capabilities/default.json`
- **Root cause:** The app only ever *writes* the clipboard (`writeText`). No
  `readText` call exists anywhere in `src/`. Clipboard-read grant is an
  exfiltration surface with no consumer.
- **Fix:** Removed `clipboard-manager:allow-read-text`.

### BUG-003 — Password generator copy is unreliable in the WebView2 origin
- **Severity:** Medium · **Category:** Functional
- **File:** `src/components/entries/PasswordGenerator.tsx`
- **Current behavior:** Used `navigator.clipboard.writeText(...)`. Every other
  copy path in the app uses the Tauri clipboard plugin. In the Tauri custom-
  protocol origin, `navigator.clipboard` is frequently unavailable/blocked; on
  failure the `await` rejected *before* `setCopied(true)`, so the copy silently
  failed **and** the user got no feedback.
- **Expected behavior:** Copy via the same `@tauri-apps/plugin-clipboard-manager`
  `writeText` as the rest of the app; failures logged, UI state consistent.
- **Fix:** Switched to plugin `writeText`, wrapped in `try/catch`.

### BUG-004 — Advertised `/` search shortcut did nothing
- **Severity:** Low · **Category:** Functional / UX
- **File:** `src/components/layout/MainLayout.tsx`
- **Root cause:** The search box renders a `/` keyboard-shortcut chip
  (`search__kbd`), but the global keydown handler implemented only
  `←/→`, `Space`, `Ctrl/Cmd+C`. The advertised affordance had no handler.
- **Fix:** Added a ref on the search input and a `/` branch that focuses &
  selects it (suppressed so the `/` isn't typed), respecting the existing
  input/modal guards.

### BUG-005 — `delete_group` could orphan entries by deleting the default group
- **Severity:** Low · **Category:** Data integrity (defense-in-depth)
- **File:** `src-tauri/src/vault/db.rs`
- **Root cause:** `Database::delete_group` had no guard for `默认分组`. The UI
  hides this action, but the Tauri command is directly invokable. Deleting the
  default group removes its `groups` row while entries still reference it —
  inconsistent state until `init_tables` recreates it on next launch.
- **Fix:** Early-return (no-op) when `name == "默认分组"`, enforcing the
  invariant at the data layer regardless of caller.

### BUG-006 — `generate_password` yields empty/garbage output for out-of-range length
- **Severity:** Low · **Category:** Edge case / robustness
- **File:** `src-tauri/src/vault/password_gen.rs`
- **Root cause:** `options.length: i32` was used unchecked. A non-positive
  length (`0..n` empty range) produced an **empty password**; an absurd length
  would attempt a huge allocation. Reachable via direct `invoke()` (UI slider
  clamps, the command does not).
- **Fix:** Clamp to `[MIN_LENGTH=8, MAX_LENGTH=4096]`. Added two unit tests
  (`test_non_positive_length_falls_back_to_minimum`,
  `test_excessive_length_is_capped`).

### BUG-007 — `CLAUDE.md` contains actively-misleading stale content
- **Severity:** Medium · **Category:** Documentation
- **File:** `CLAUDE.md`
- **Root cause:** (a) A "⚠️ Known mismatch" block claimed the password
  generator is broken (`generate_password` vs `generate_password_cmd`) and told
  maintainers *not* to fix it — but the code already matches and works.
  (b) The "Database path resolution" section described a cwd-`./vault.db`-then-
  appdata strategy; the code uses portable `current_exe()/vault.db` with an
  appdata fallback. (c) The registered-command list omitted
  `change_master_password`, `reorder_entries`, `move_entries_to_group`,
  `export_csv_selected`. (d) Version said v3.0.0.
- **Fix:** Corrected all four to match the code.

---

## Documented — not changed (rationale)

### FIND-008 — Clipboard is never auto-cleared after copying a password
- **Severity:** Medium · **Category:** Security
- **Why not changed:** Auto-clearing the OS clipboard on a timer is a product
  behavior change with real UX trade-offs (wipes unrelated user clipboard
  content). It needs an explicit product decision (opt-in setting, timeout
  length, "only if unchanged" check). **Recommended** as a follow-up feature.

### FIND-009 — Global `Space` `preventDefault` breaks Space-activating focused buttons
- **Severity:** Low · **Category:** Accessibility
- **File:** `src/components/layout/MainLayout.tsx`
- **Why not changed:** The reveal-on-Space shortcut is intentional; narrowing
  it without regressing the feature is a design decision (e.g., only when no
  button is focused). Documented for product/UX owner.

### FIND-010 — Master row hard-codes `WHERE id = 1`
- **Severity:** Low (latent) · **Category:** Robustness
- **Files:** `src-tauri/src/vault/db.rs` (`get_master_record`, `get_password_hint`)
- **Why not changed:** `create_master` doesn't pin `id`, so a row with `id != 1`
  would make the vault read as "not initialized". No reproduction exists (single
  insert ⇒ rowid 1 in practice), and this is a crypto-adjacent unlock path that
  `CLAUDE.md` explicitly forbids changing without a written migration. Flagged
  for a future migration-backed hardening (`SELECT … ORDER BY id LIMIT 1`).

### FIND-011 — Batch delete is O(N) round-trips
- **Severity:** Low · **Category:** Performance
- **File:** `src/components/entries/EntryTable.tsx` → `vaultStore.deleteEntry`
- **Why not changed:** Correct, just inefficient (each delete reloads entries +
  groups). A transactional `delete_entries(ids)` backend command is the right
  fix but is a feature addition beyond a safe audit pass.

### FIND-012 — CSV import assumes a header row
- **Severity:** Low · **Category:** Robustness
- **File:** `src-tauri/src/vault/db.rs::import_csv`
- **Why not changed:** `has_headers(true)` matches the app's own export format
  (by design). A headerless third-party CSV silently drops its first data row.
  Changing this is a contract/UX decision (header detection or a UI toggle).

### FIND-013 — Code-quality / lint
- **Severity:** Informational
- `computeStrength` is duplicated verbatim in `UnlockScreen.tsx` and
  `ChangePasswordModal.tsx` — extract to a shared util.
- Pre-existing clippy warnings (not introduced by this pass):
  `unnecessary_unwrap` in `db.rs::get_entries`; `too_many_arguments` on
  `db.rs::update_entry`.

---

## Verification log

| Gate | Before | After |
|---|---|---|
| `cargo test` | 7 passed | **9 passed** (2 new) |
| `tsc --noEmit` | clean | clean |
| `cargo clippy` | 2 cosmetic warnings | same 2, **no new** |

## Follow-up — v3.4.1 (clipboard auto-clear)

After the audit, the user prioritized **FIND-008** and it was implemented:

- **FIND-008 → implemented.** Copying a password (entry password or generator
  output; *not* usernames) arms a 60-second timer. On expiry the clipboard is
  read and wiped **only if it still equals the copied password** (so content
  the user copied since is never destroyed); if the read fails the clipboard is
  cleared anyway (fail-safe toward not leaking the secret). Locking the vault
  clears immediately. A bottom-right toast shows a live countdown and a brief
  "已从剪贴板清除" confirmation. The plaintext is held module-scoped (not in
  React state) only long enough for the equality check.
- **BUG-002 — partial, intentional reversal.** `clipboard-manager:allow-read-text`
  was **re-added** because the conditional ("only if unchanged") clear requires
  reading the clipboard. This was an explicit user decision (safer clear vs. a
  slightly larger local attack surface). `shell:allow-execute` (BUG-001) stays
  removed — that reversal was unrelated and remains in force.
- Version bumped **3.4.0 → 3.4.1** across `package.json`, `Cargo.toml`,
  `tauri.conf.json`, the in-app version strings, and `README.md` (+ changelog).

## Preventive recommendations

1. **CI**: add a workflow running `cargo test`, `cargo clippy -- -D warnings`
   (after clearing the 2 known ones), and `tsc --noEmit` on every PR.
2. **Capabilities**: treat `capabilities/default.json` as least-privilege —
   review on every plugin change; never grant `shell:allow-execute` without a
   concrete consumer.
3. **Docs drift**: `CLAUDE.md` had multiple stale claims; add a checklist item
   to update it alongside command/path changes.
4. **Shared logic**: de-duplicate `computeStrength`.
5. **Security backlog**: prioritize FIND-008 (clipboard auto-clear) for the
   threat model of a password manager.
