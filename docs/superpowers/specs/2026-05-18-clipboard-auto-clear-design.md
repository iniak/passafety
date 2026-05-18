# Clipboard auto-clear — design

- **Date:** 2026-05-18 · **Ships in:** v3.4.1 · **Origin:** audit FIND-008

## Goal

After a password is copied, automatically wipe it from the OS clipboard 60s
later, and surface a countdown so the user knows it will happen.

## Decisions (confirmed with user)

1. **Trigger scope:** password copies only — entry password (context menu,
   inline copy menu, Ctrl+C) and the password generator. Username copies are
   unaffected.
2. **Clear strategy:** conditional — at expiry, read the clipboard and wipe
   **only if it still equals the copied password**, so content the user copied
   in the meantime is never destroyed. If the read fails, clear anyway
   (fail-safe toward not leaking the secret). This required re-adding the
   `clipboard-manager:allow-read-text` capability (intentional, scoped partial
   reversal of audit BUG-002; `shell:allow-execute` stays removed).
3. **UI:** bottom-right toast with a live `Ns` countdown, then a brief
   "已从剪贴板清除" confirmation, then it disappears.

## Architecture (store-centric, matches existing single-source-of-truth rule)

- **`vaultStore`**
  - `copyPassword(value)`: `writeText(value)` → stash secret module-scoped,
    cancel any prior timer, set `clipboardGuard = {clearAt, phase:'counting'}`,
    start a 60s timer. Latest password copy wins.
  - `_runClipboardClear()`: read clipboard; conditional `writeText('')`; set
    `phase:'cleared'` for 2.5s then `clipboardGuard = null`. If not cleared
    (user changed clipboard / clear failed) drop the toast silently.
  - `lock()` cancels the timer and clears immediately.
  - The plaintext lives in a module-scoped variable (not React state) only long
    enough for the equality check.
- **`ClipboardToast`** (new, portalled to `body`, rendered once in
  `MainLayout`): renders the countdown from `clipboardGuard`; the authoritative
  timer is the store's.
- **Call sites:** MainLayout Ctrl+C, EntryTable context menu + inline copy menu
  (password), PasswordGenerator → all route to `copyPassword`.

## Error handling

Write failure → no timer, no toast, logged. Read failure at expiry → clear
anyway + logged.

## Verification

`tsc --noEmit` clean; production build green. Manual: copy → watch countdown →
verify wiped; copy-then-copy-other → original not wiped; lock → cleared at once.
