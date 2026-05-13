import { useState, useEffect, useMemo, FormEvent } from 'react';
import { Eye, EyeOff, Check, AlertTriangle, HelpCircle, Loader2, Sun, Moon } from 'lucide-react';
import { useVaultStore } from '../../stores/vaultStore';

function VaultIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
      <rect x="3.5" y="6.5" width="17" height="13" rx="1" />
      <circle cx="9" cy="13" r="2.5" />
      <path d="M9 15.5 V18 M14 11 H17 M14 13 H17 M14 15 H17" />
    </svg>
  );
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

function StrengthMeter({ score, label, entropy }: { score: number; label: string; entropy: number }) {
  return (
    <div className="strength">
      <div className="strength__bars">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`strength__bar ${i < score ? `is-on is-on--${score}` : ''}`} />
        ))}
      </div>
      <div className="strength__meta">
        <span className={`strength__lbl strength__lbl--${score}`}>{label.toUpperCase()}</span>
        <span className="strength__entropy">{entropy} BITS</span>
      </div>
    </div>
  );
}

export default function UnlockScreen() {
  const {
    unlock, setup, getHint, checkInitialized,
    passwordHint, isInitialized, loading, error, clearError,
    theme, toggleTheme,
  } = useVaultStore();
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [hint, setHint] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [showHint, setShowHint] = useState(false);

  const isSetup = !isInitialized;
  const strength = useMemo(() => computeStrength(password), [password]);

  useEffect(() => {
    const check = async () => {
      setIsChecking(true);
      const initialized = await checkInitialized();
      if (initialized) await getHint();
      setIsChecking(false);
    };
    check();
  }, [checkInitialized, getHint]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (isSetup) {
      if (password !== confirmPwd) {
        useVaultStore.setState({ error: '两次输入的密码不一致' });
        return;
      }
      if (password.length < 6) {
        useVaultStore.setState({ error: '密码长度至少为 6 位' });
        return;
      }
      await setup(password, hint);
    } else {
      await unlock(password);
    }
  };

  const handleShowHint = async () => {
    await getHint();
    setShowHint(true);
  };

  if (isChecking) {
    return (
      <div className="screen">
        <div className="setup">
          <div className="setup__bg"><div className="setup__grid" /><div className="setup__glow" /></div>
          <div className="setup__panel" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--amber)' }} />
            <div style={{ marginTop: 14, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em' }}>
              CHECKING VAULT…
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen--setup">
      <div className="setup">
        <div className="setup__bg">
          <div className="setup__grid" />
          <div className="setup__glow" />
        </div>

        <div className="setup__panel">
          {/* Brand strip */}
          <div className="setup__brand">
            <div className="brandmark">
              <div className="brandmark__box"><VaultIcon size={22} /></div>
              <div className="brandmark__text">
                <div className="brandmark__name">PASSAFETY</div>
                <div className="brandmark__tag">v 3.4 · LOCAL VAULT</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="setup__step">
                <span className="setup__stepNum">{isSetup ? '01' : '✓'}</span>
                <span>{isSetup ? 'CREATE MASTER KEY · 初始化' : 'UNLOCK VAULT · 解锁'}</span>
              </div>
              <button
                type="button"
                className="iconBtn iconBtn--ghost"
                onClick={toggleTheme}
                title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>

          <div className="setup__split">
            {/* Left — copy */}
            <div className="setup__copy">
              <div className="eyebrow">A SECURE PASSWORD MANAGER</div>
              <h1 className="setup__h">
                {isSetup ? '一把钥匙，' : '欢迎回来，'}
                <br />
                <span className="setup__hAmber">{isSetup ? '守护所有密码。' : '请输入主密码。'}</span>
              </h1>
              <p className="setup__lede">
                {isSetup
                  ? '主密码是唯一能解开这个密码库的凭证。它不会上传网络、不会以明文存储、一旦遗失无法找回。请谨慎选择。'
                  : '主密码不在本机以外的任何地方存储。输入正确的主密码即可解锁全部凭据，关闭程序或锁定后密钥会立即从内存中擦除。'}
              </p>

              {isSetup && (
                <div className="rules">
                  <div className="rules__title">RECOMMENDED · 建议</div>
                  <ul className="rules__list">
                    <li><span className="rules__bullet" /> 至少 12 个字符</li>
                    <li><span className="rules__bullet" /> 包含大小写、数字、符号</li>
                    <li><span className="rules__bullet" /> 易记的短句，避免字典词</li>
                    <li><span className="rules__bullet" /> 不要复用其它平台密码</li>
                  </ul>
                </div>
              )}

              <div className="warn">
                <div className="warn__bar" />
                <div className="warn__body">
                  <div className="warn__head">
                    <AlertTriangle size={14} />
                    <span>合规提示</span>
                  </div>
                  <div className="warn__text">
                    禁止保存非本人操作账号 / 管理员账号密码。
                  </div>
                </div>
              </div>
            </div>

            {/* Right — form */}
            <div className="setup__form">
              <form onSubmit={handleSubmit} className="formCard">
                <div className="formCard__head">
                  <div className="formCard__id">{isSetup ? 'VAULT.NEW' : 'VAULT.UNLOCK'}</div>
                  <div className="formCard__sig">
                    <span className="dot dot--ok" />
                    OFFLINE · ENCRYPTED AT REST
                  </div>
                </div>

                <div className="field">
                  <label className="field__lbl">
                    <span>{isSetup ? 'Master password · 设置主密码' : 'Master password · 主密码'}</span>
                    {isSetup && <span className="field__hint">{password.length} chars</span>}
                  </label>
                  <div className="field__inputWrap">
                    <input
                      className="field__input"
                      type={showPwd ? 'text' : 'password'}
                      placeholder="• • • • • • • • • • • •"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                      required
                    />
                    <button type="button" className="field__eye" onClick={() => setShowPwd(!showPwd)} tabIndex={-1}>
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {isSetup && <StrengthMeter score={strength.score} label={strength.label} entropy={strength.entropy} />}
                </div>

                {isSetup && (
                  <>
                    <div className="field">
                      <label className="field__lbl">
                        <span>Confirm · 确认密码</span>
                      </label>
                      <div className="field__inputWrap">
                        <input
                          className="field__input"
                          type={showConfirm ? 'text' : 'password'}
                          placeholder="• • • • • • • • • • • •"
                          value={confirmPwd}
                          onChange={(e) => setConfirmPwd(e.target.value)}
                          required
                        />
                        <button type="button" className="field__eye" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}>
                          {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <div className="field__status">
                        {confirmPwd.length === 0 ? (
                          <span className="muted">RE-ENTER MASTER PASSWORD TO CONFIRM</span>
                        ) : confirmPwd === password ? (
                          <span className="ok"><Check size={12} /> PASSWORDS MATCH</span>
                        ) : (
                          <span className="err"><AlertTriangle size={12} /> PASSWORDS DO NOT MATCH</span>
                        )}
                      </div>
                    </div>

                    <div className="field">
                      <label className="field__lbl">
                        <span>Hint <span className="field__opt">(可选)</span></span>
                        <span className="field__hint">密码提示</span>
                      </label>
                      <input
                        className="field__input--plain"
                        placeholder="例如：生日或纪念日"
                        value={hint}
                        onChange={(e) => setHint(e.target.value)}
                      />
                      <div className="field__status">
                        <span className="muted">HINT IS PLAINTEXT · 切勿在提示中泄露主密码</span>
                      </div>
                    </div>
                  </>
                )}

                {!isSetup && passwordHint && (
                  <div className="field">
                    {showHint ? (
                      <div className="field__status">
                        <span className="muted">HINT ·</span>
                        <span style={{ color: 'var(--ink-2)', letterSpacing: 0, textTransform: 'none' }}>{passwordHint}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleShowHint}
                        className="field__status"
                        style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-3)' }}
                      >
                        <HelpCircle size={12} />
                        <span>SHOW PASSWORD HINT · 显示密码提示</span>
                      </button>
                    )}
                  </div>
                )}

                {error && (
                  <div className="field">
                    <div className="field__status">
                      <span className="err"><AlertTriangle size={12} /> {error.toUpperCase()}</span>
                    </div>
                  </div>
                )}

                <div className="formCard__foot">
                  <div className="formCard__meta">
                    <div className="metaRow"><span>CIPHER</span><span className="metaRow__v">AES-256-GCM</span></div>
                    <div className="metaRow"><span>KDF</span><span className="metaRow__v">PBKDF2-HMAC-SHA256 · 100K</span></div>
                    <div className="metaRow"><span>STORE</span><span className="metaRow__v">PORTABLE · ./vault.db</span></div>
                  </div>
                  <button className="btnPrimary" type="submit" disabled={loading}>
                    <span>{loading ? '处理中…' : isSetup ? 'CREATE VAULT' : 'UNLOCK'}</span>
                    <span className="btnPrimary__kbd">↵</span>
                  </button>
                </div>
              </form>

              <div className="hairlineNote">
                {isSetup
                  ? '继续即代表你接受：丢失主密码后无法找回。'
                  : '锁定状态下密钥从内存擦除，关闭程序前请确认已保存所做修改。'}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="setup__footer">
            <div className="setup__footL">
              <span>PASSAFETY</span>
              <span className="sep">/</span>
              <span>v3.4.0</span>
              <span className="sep">/</span>
              <span>WIN-X64</span>
            </div>
            <div className="setup__footR">
              <span className="dot dot--ok" />
              <span>NO NETWORK ACTIVITY · BUILD VERIFIED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
