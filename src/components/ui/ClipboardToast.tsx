import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clipboard, ShieldCheck } from 'lucide-react';
import { useVaultStore } from '../../stores/vaultStore';

/**
 * Bottom-right notice shown after a password is copied. While the 60s guard is
 * counting it displays a live countdown; once the clipboard is wiped it shows a
 * brief confirmation, then disappears. The authoritative timer lives in the
 * store — this component only renders the remaining time.
 */
export default function ClipboardToast() {
  const guard = useVaultStore((s) => s.clipboardGuard);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!guard || guard.phase !== 'counting') return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [guard]);

  if (!guard) return null;

  const remaining =
    guard.phase === 'counting'
      ? Math.max(0, Math.ceil((guard.clearAt - now) / 1000))
      : 0;

  return createPortal(
    <div className="clipToast" role="status" aria-live="polite">
      {guard.phase === 'counting' ? (
        <>
          <Clipboard size={14} />
          <span>
            密码已复制 · <strong>{remaining}s</strong> 后自动从剪贴板清除
          </span>
        </>
      ) : (
        <>
          <ShieldCheck size={14} />
          <span>已从剪贴板清除</span>
        </>
      )}
    </div>,
    document.body,
  );
}
