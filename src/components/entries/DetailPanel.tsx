import { useState } from 'react';
import { Copy, Eye, EyeOff, Pencil, Trash2, FileText } from 'lucide-react';
import { VaultEntry } from '../../types';

interface DetailPanelProps {
  entry: VaultEntry | null;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (entry: VaultEntry) => void;
  onCopy: (value: string) => void;
}

function getInitial(s: string): string {
  const ch = s.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 1).toUpperCase();
  return ch || '?';
}

function computeStrength(pwd: string) {
  if (!pwd) return { score: 0, label: '—', entropy: 0 };
  let pool = 0;
  if (/[a-z]/.test(pwd)) pool += 26;
  if (/[A-Z]/.test(pwd)) pool += 26;
  if (/[0-9]/.test(pwd)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pwd)) pool += 32;
  const entropy = Math.round(pwd.length * Math.log2(Math.max(pool, 2)));
  let score = 0;
  if (entropy >= 28) score = 1;
  if (entropy >= 48) score = 2;
  if (entropy >= 72) score = 3;
  if (entropy >= 96) score = 4;
  const labels = ['未知', '弱', '一般', '良好', '极强'];
  return { score, label: labels[score], entropy };
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dRow">
      <div className="dRow__l">{label}</div>
      <div className="dRow__r">{children}</div>
    </div>
  );
}

export default function DetailPanel({ entry, onEdit, onDelete, onCopy }: DetailPanelProps) {
  const [revealed, setRevealed] = useState(false);

  if (!entry) {
    return (
      <section className="detail">
        <div className="detailEmpty">
          <div className="detailEmpty__icon"><FileText size={26} /></div>
          <div>选中条目查看详情</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em' }}>SELECT AN ENTRY</div>
        </div>
      </section>
    );
  }

  const strength = computeStrength(entry.password);

  return (
    <section className="detail">
      <div className="detail__head">
        <div className="detail__faviconWrap">
          <div className="favicon favicon--lg">{getInitial(entry.website)}</div>
          <div className="detail__halo" />
        </div>
        <div className="detail__title">{entry.website}</div>
        <div className="detail__sub mono">#{String(entry.id).padStart(4, '0')} · {entry.group}</div>

        <div className="detail__strength">
          <div className="strength">
            <div className="strength__bars">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`strength__bar ${i < strength.score ? `is-on is-on--${strength.score}` : ''}`} />
              ))}
            </div>
            <div className="strength__meta">
              <span className={`strength__lbl strength__lbl--${strength.score}`}>{strength.label.toUpperCase()}</span>
              <span className="strength__entropy">{strength.entropy} BITS</span>
            </div>
          </div>
        </div>
      </div>

      <div className="detail__section">
        <div className="detail__sectionH">CREDENTIALS · 凭据</div>
        <DetailRow label="用户名">
          <span className="mono" title={entry.username}>{entry.username || '—'}</span>
          <button className="rowBtn" title="复制" onClick={() => onCopy(entry.username)}>
            <Copy size={12} />
          </button>
        </DetailRow>
        <DetailRow label="密码">
          <span className={`mono ${revealed ? 'pwd--full' : ''}`} title={revealed ? entry.password : undefined}>
            {revealed ? entry.password : '•'.repeat(Math.max(8, Math.min(16, entry.password.length)))}
          </span>
          <button className="rowBtn" title={revealed ? '隐藏' : '显示'} onClick={() => setRevealed(!revealed)}>
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button className="rowBtn" title="复制" onClick={() => onCopy(entry.password)}>
            <Copy size={12} />
          </button>
        </DetailRow>
        <DetailRow label="长度">
          <span className="mono">{entry.password.length} chars</span>
        </DetailRow>
      </div>

      <div className="detail__section">
        <div className="detail__sectionH">META · 元数据</div>
        <DetailRow label="分组">
          <span className="tag">{entry.group}</span>
        </DetailRow>
        <DetailRow label="备注">
          <span className="mono is-multiline" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {entry.comment || '—'}
          </span>
        </DetailRow>
        <DetailRow label="ID">
          <span className="mono muted">#{String(entry.id).padStart(4, '0')}</span>
        </DetailRow>
      </div>

      <div className="detail__foot">
        <button className="btnPrimary btnPrimary--sm" onClick={() => onEdit(entry)}>
          <Pencil size={12} />
          <span>编辑</span>
        </button>
        <button className="btnGhost" onClick={() => onDelete(entry)} title="删除">
          <Trash2 size={12} />
        </button>
      </div>
    </section>
  );
}
