import { useState, useEffect, FormEvent } from 'react';
import { X, Key, Eye, EyeOff } from 'lucide-react';
import { VaultEntry } from '../../types';
import { useVaultStore } from '../../stores/vaultStore';
import PasswordGenerator from './PasswordGenerator';

interface EntryFormProps {
  entry: VaultEntry | null;
  defaultGroup?: string;
  onClose: () => void;
}

export default function EntryForm({ entry, defaultGroup, onClose }: EntryFormProps) {
  const { addEntry, updateEntry, groups } = useVaultStore();
  const [form, setForm] = useState({
    website: entry?.website || '',
    username: entry?.username || '',
    password: entry?.password || '',
    group: entry?.group || defaultGroup || '默认分组',
    comment: entry?.comment || '',
  });
  const [showPwd, setShowPwd] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);

  useEffect(() => {
    useVaultStore.getState().loadGroups();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (entry) {
      await updateEntry({ ...entry, ...form });
    } else {
      await addEntry(form);
    }
    onClose();
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <form
        className="formCard modalCard modalCard--wide entryForm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="formCard__head">
          <div className="formCard__id">{entry ? '编辑条目' : '新建条目'}</div>
          <button type="button" className="iconBtn iconBtn--ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modalCard__body">
          <div className="field">
            <label className="field__lbl">
              <span>标题</span>
              <span className="field__hint">必填</span>
            </label>
            <input
              className="field__input--plain"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>用户名</span>
              <span className="field__hint">必填</span>
            </label>
            <input
              className="field__input--plain"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>密码</span>
              <span className="field__hint">{form.password.length} 字符</span>
            </label>
            <div className="field__inputWrap">
              <input
                className="field__input"
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="• • • • • • • • • • • •"
                required
              />
              <button
                type="button"
                className="field__eye"
                onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                className="field__eye"
                onClick={() => setShowGenerator(true)}
                title="生成密码"
              >
                <Key size={16} />
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>分组</span>
            </label>
            <select
              className="field__select"
              value={form.group}
              onChange={(e) => setForm({ ...form, group: e.target.value })}
            >
              {groups.map((g) => (
                <option key={g.name} value={g.name}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__lbl">
              <span>备注</span>
              <span className="field__opt">可选</span>
            </label>
            <textarea
              className="field__input--textarea"
              rows={3}
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
            />
          </div>
        </div>

        <div className="formCard__foot">
          <div className="formCard__meta">
            <div className="metaRow">
              <span>算法</span>
              <span className="metaRow__v">AES-256-GCM</span>
            </div>
            <div className="metaRow">
              <span>随机数</span>
              <span className="metaRow__v">12 字节随机</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btnGhost" onClick={onClose}>取消</button>
            <button type="submit" className="btnPrimary btnPrimary--sm">
              <span>{entry ? '保存' : '创建'}</span>
              <span className="btnPrimary__kbd">↵</span>
            </button>
          </div>
        </div>

        {showGenerator && (
          <PasswordGenerator
            onSelect={(pwd) => { setForm({ ...form, password: pwd }); setShowGenerator(false); }}
            onClose={() => setShowGenerator(false)}
          />
        )}
      </form>
    </div>
  );
}
