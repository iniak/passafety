import { X } from 'lucide-react';

interface AboutModalProps {
  onClose: () => void;
}

function VaultIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
      <rect x="3.5" y="6.5" width="17" height="13" rx="1" />
      <circle cx="9" cy="13" r="2.5" />
      <path d="M9 15.5 V18 M14 11 H17 M14 13 H17 M14 15 H17" />
    </svg>
  );
}

export default function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="formCard modalCard entryForm"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="formCard__head">
          <div className="formCard__id">关于 Passafety</div>
          <button type="button" className="iconBtn iconBtn--ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modalCard__body">
          <div className="field" style={{ textAlign: 'center', padding: '24px 22px 18px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 6, background: 'linear-gradient(180deg, var(--amber), var(--amber-2))', color: '#1a1206', marginBottom: 14 }}>
              <VaultIcon size={28} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '0.04em' }}>
              PASSAFETY
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', marginTop: 4, letterSpacing: '0.12em' }}>
              v 3.4.1 · LOCAL VAULT
            </div>
          </div>

          <div className="field">
            <div className="formCard__meta">
              <div className="metaRow"><span>架构</span><span className="metaRow__v">Tauri 2 + Rust + React</span></div>
              <div className="metaRow"><span>加密</span><span className="metaRow__v">AES-256-GCM</span></div>
              <div className="metaRow"><span>密钥派生</span><span className="metaRow__v">PBKDF2-HMAC-SHA256 · 100k</span></div>
              <div className="metaRow"><span>存储</span><span className="metaRow__v">本地 SQLite · 完全离线</span></div>
              <div className="metaRow"><span>平台</span><span className="metaRow__v">Windows x64</span></div>
            </div>
          </div>

          <div className="field" style={{ borderBottom: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              所有密码均以独立随机 nonce 加密后存储于本地数据库；主密钥不在内存外的任何位置驻留，锁定时立即擦除。本程序不向任何外部服务器发送数据。
            </div>
          </div>
        </div>

        <div className="formCard__foot">
          <div className="formCard__meta">
            <div className="metaRow"><span>构建</span><span className="metaRow__v">PORTABLE · ./vault.db</span></div>
          </div>
          <button type="button" className="btnPrimary btnPrimary--sm" onClick={onClose}>
            <span>关闭</span>
            <span className="btnPrimary__kbd">↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}
