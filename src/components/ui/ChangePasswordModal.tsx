import { useState, useEffect, useMemo, FormEvent } from 'react';
import { X, Eye, EyeOff, Check, AlertTriangle } from 'lucide-react';
import { useVaultStore } from '../../stores/vaultStore';

interface ChangePasswordModalProps {
  onClose: () => void;
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
  const labels = ['未输入', '弱', '一般', '良好', '极强'];
  return { score, label: labels[score], entropy };
}

export default function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const { changeMasterPassword, passwordHint, getHint, loading, error, clearError } = useVaultStore();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [hint, setHint] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);

  // Prefill hint with existing one
  useEffect(() => {
    getHint().then(() => setHint(useVaultStore.getState().passwordHint));
  }, [getHint]);

  const strength = useMemo(() => computeStrength(newPwd), [newPwd]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (newPwd !== confirmPwd) {
      useVaultStore.setState({ error: '两次输入的新密码不一致' });
      return;
    }
    if (newPwd.length < 6) {
      useVaultStore.setState({ error: '新密码长度至少为 6 位' });
      return;
    }
    if (newPwd === oldPwd) {
      useVaultStore.setState({ error: '新密码不能与原主密码相同' });
      return;
    }
    const ok = await changeMasterPassword(oldPwd, newPwd, hint);
    if (ok) {
      setSuccess(true);
      setTimeout(onClose, 1500);
    }
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <form
        className="formCard modalCard modalCard--wide entryForm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="formCard__head">
          <div className="formCard__id">修改主密码</div>
          <button type="button" className="iconBtn iconBtn--ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modalCard__body">
          <div className="field" style={{ background: 'var(--err-soft)', borderLeft: '3px solid var(--err)' }}>
            <div className="warn__head" style={{ marginBottom: 6 }}>
              <AlertTriangle size={14} />
              <span>重要提示</span>
            </div>
            <div className="warn__text">
              修改主密码会以新密钥重新加密所有条目。完成后请妥善保管新密码，一旦遗失无法找回。
            </div>
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>原主密码</span>
              <span className="field__hint">必填</span>
            </label>
            <div className="field__inputWrap">
              <input
                className="field__input"
                type={showOld ? 'text' : 'password'}
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                placeholder="• • • • • • • • • • • •"
                required
                autoFocus
              />
              <button type="button" className="field__eye" onClick={() => setShowOld(!showOld)} tabIndex={-1}>
                {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>新主密码</span>
              <span className="field__hint">{newPwd.length} 字符</span>
            </label>
            <div className="field__inputWrap">
              <input
                className="field__input"
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="• • • • • • • • • • • •"
                required
              />
              <button type="button" className="field__eye" onClick={() => setShowNew(!showNew)} tabIndex={-1}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="strength" style={{ marginTop: 10 }}>
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

          <div className="field">
            <label className="field__lbl">
              <span>确认新密码</span>
            </label>
            <div className="field__inputWrap">
              <input
                className="field__input"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="• • • • • • • • • • • •"
                required
              />
              <button type="button" className="field__eye" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="field__status">
              {confirmPwd.length === 0 ? (
                <span className="muted">再次输入新密码以确认</span>
              ) : confirmPwd === newPwd ? (
                <span className="ok"><Check size={12} /> 两次输入一致</span>
              ) : (
                <span className="err"><AlertTriangle size={12} /> 两次输入不一致</span>
              )}
            </div>
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>密码提示</span>
              <span className="field__opt">可选</span>
            </label>
            <input
              className="field__input--plain"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="例如：生日或纪念日"
            />
            <div className="field__status">
              <span className="muted">{passwordHint ? `当前提示：${passwordHint}` : '未设置提示'}</span>
            </div>
          </div>

          {error && (
            <div className="field">
              <div className="field__status">
                <span className="err"><AlertTriangle size={12} /> {error}</span>
              </div>
            </div>
          )}

          {success && (
            <div className="field">
              <div className="field__status">
                <span className="ok"><Check size={12} /> 主密码已成功更新，密码库仍处于解锁状态</span>
              </div>
            </div>
          )}
        </div>

        <div className="formCard__foot">
          <div className="formCard__meta">
            <div className="metaRow"><span>处理</span><span className="metaRow__v">重加密所有条目</span></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btnGhost" onClick={onClose} disabled={loading}>
              取消
            </button>
            <button type="submit" className="btnPrimary btnPrimary--sm" disabled={loading || success}>
              <span>{loading ? '处理中…' : success ? '✓ 已更新' : '确认修改'}</span>
              {!loading && !success && <span className="btnPrimary__kbd">↵</span>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
