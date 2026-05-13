import { useState } from 'react';
import { X, RefreshCw, Copy, Check } from 'lucide-react';
import { useVaultStore, PasswordOptions } from '../../stores/vaultStore';

interface PasswordGeneratorProps {
  onSelect: (password: string) => void;
  onClose: () => void;
}

export default function PasswordGenerator({ onSelect, onClose }: PasswordGeneratorProps) {
  const { generatePassword } = useVaultStore();
  const [options, setOptions] = useState<PasswordOptions>({
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    const p = await generatePassword(options);
    setPassword(p);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="formCard modalCard"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="formCard__head">
          <div className="formCard__id">GEN.PWD · 密码生成器</div>
          <button type="button" className="iconBtn iconBtn--ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modalCard__body">
          <div className="field">
            <label className="field__lbl">
              <span>Output · 生成结果</span>
              <span className="field__hint">{password ? `${password.length} chars` : '点击生成'}</span>
            </label>
            <div className="pwdPreview">
              <div className={`pwdPreview__val ${password ? '' : 'is-empty'}`}>
                {password || '— 点击下方按钮生成 —'}
              </div>
              <button
                type="button"
                className="pwdPreview__btn"
                onClick={handleCopy}
                disabled={!password}
                title="复制"
              >
                {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
              </button>
              <button
                type="button"
                className="pwdPreview__btn"
                onClick={generate}
                title="重新生成"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>Length · 长度</span>
              <span className="field__hint mono" style={{ color: 'var(--amber)', letterSpacing: '0.04em' }}>
                {options.length}
              </span>
            </label>
            <input
              type="range"
              min={8}
              max={64}
              value={options.length}
              onChange={(e) => setOptions({ ...options, length: parseInt(e.target.value) })}
              className="slider"
            />
            <div className="field__status">
              <span className="muted">8</span>
              <span style={{ flex: 1 }} />
              <span className="muted">64</span>
            </div>
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>Character Sets · 字符集</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              <label className="checkRow">
                <input
                  type="checkbox"
                  checked={options.uppercase}
                  onChange={(e) => setOptions({ ...options, uppercase: e.target.checked })}
                />
                <span>A-Z 大写</span>
              </label>
              <label className="checkRow">
                <input
                  type="checkbox"
                  checked={options.lowercase}
                  onChange={(e) => setOptions({ ...options, lowercase: e.target.checked })}
                />
                <span>a-z 小写</span>
              </label>
              <label className="checkRow">
                <input
                  type="checkbox"
                  checked={options.numbers}
                  onChange={(e) => setOptions({ ...options, numbers: e.target.checked })}
                />
                <span>0-9 数字</span>
              </label>
              <label className="checkRow">
                <input
                  type="checkbox"
                  checked={options.symbols}
                  onChange={(e) => setOptions({ ...options, symbols: e.target.checked })}
                />
                <span>!@# 符号</span>
              </label>
            </div>
          </div>
        </div>

        <div className="formCard__foot">
          <div className="formCard__meta">
            <div className="metaRow">
              <span>RNG</span>
              <span className="metaRow__v">OS · CSPRNG</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btnGhost" onClick={onClose}>取消</button>
            <button
              type="button"
              className="btnPrimary btnPrimary--sm"
              onClick={() => onSelect(password)}
              disabled={!password}
            >
              <span>使用此密码</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
