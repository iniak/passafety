import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, Upload, Download, Plus, Lock, Menu, X, Sun, Moon, Info, KeyRound } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useVaultStore } from '../../stores/vaultStore';
import Sidebar from './Sidebar';
import EntryTable from '../entries/EntryTable';
import EntryForm from '../entries/EntryForm';
import ConfirmDialog from '../ui/ConfirmDialog';
import AboutModal from '../ui/AboutModal';
import ChangePasswordModal from '../ui/ChangePasswordModal';
import { VaultEntry } from '../../types';

function VaultIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
      <rect x="3.5" y="6.5" width="17" height="13" rx="1" />
      <circle cx="9" cy="13" r="2.5" />
      <path d="M9 15.5 V18 M14 11 H17 M14 13 H17 M14 15 H17" />
    </svg>
  );
}

export default function MainLayout() {
  const {
    lock, entries, searchQuery, setSearchQuery, selectedGroup, setSelectedGroup,
    addGroup, exportCsv, importCsv, loading, groups,
    theme, toggleTheme,
  } = useVaultStore();

  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<VaultEntry | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<VaultEntry | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [confirmLock, setConfirmLock] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close app menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const off = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [menuOpen]);

  const toggleReveal = useCallback((id: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((e) =>
      e.website.toLowerCase().includes(q) ||
      e.username.toLowerCase().includes(q) ||
      (e.comment || '').toLowerCase().includes(q) ||
      e.group.toLowerCase().includes(q),
    );
  }, [entries, searchQuery]);

  // Keep selected entry in sync with the latest entries data (after edit/delete)
  const currentSelected = selectedEntry
    ? entries.find((e) => e.id === selectedEntry.id) ?? null
    : null;

  const handleCopy = useCallback(async (value: string) => {
    if (!value) return;
    await writeText(value);
  }, []);

  const handleExport = async () => {
    const path = await save({
      defaultPath: 'passafety-export.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (path) await exportCsv(path as string);
  };

  const handleImport = async () => {
    const path = await open({
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (path) await importCsv(path as string);
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      await addGroup(newGroupName.trim());
      setNewGroupName('');
      setShowAddGroup(false);
    }
  };

  const handleEdit = (entry: VaultEntry) => {
    setEditEntry(entry);
    setShowForm(true);
  };

  const groupLabel = selectedGroup === '全部' ? 'ALL · 全部' : selectedGroup;

  // Keyboard shortcuts: ←/→ cycle groups, Space toggles reveal on selected entry,
  // Ctrl+C copies selected entry's password.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack when typing in a form field
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Don't fire when any modal is open
      if (document.querySelector('.modalBackdrop')) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const all = ['全部', ...groups.map((g) => g.name)];
        const idx = all.indexOf(selectedGroup);
        if (idx < 0) return;
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = all[(idx + dir + all.length) % all.length];
        setSelectedGroup(next);
      } else if (e.key === ' ' || e.code === 'Space') {
        if (!currentSelected) return;
        e.preventDefault();
        toggleReveal(currentSelected.id);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (!currentSelected) return;
        e.preventDefault();
        handleCopy(currentSelected.password);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [groups, selectedGroup, setSelectedGroup, currentSelected, toggleReveal, handleCopy]);

  const handleLockClick = () => setConfirmLock(true);
  const handleLockConfirm = () => {
    setConfirmLock(false);
    lock();
  };

  return (
    <div className="screen screen--vault">
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar__left">
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              className="iconBtn iconBtn--ghost"
              title="菜单"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Menu size={16} />
            </button>
            {menuOpen && (
              <div className="appMenu">
                <button
                  className="appMenu__item"
                  onClick={() => { setMenuOpen(false); setShowChangePwd(true); }}
                >
                  <KeyRound size={14} />
                  <span>修改主密码</span>
                </button>
                <button
                  className="appMenu__item"
                  onClick={() => { setMenuOpen(false); toggleTheme(); }}
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  <span>{theme === 'dark' ? '切换浅色模式' : '切换深色模式'}</span>
                </button>
                <hr className="appMenu__sep" />
                <button
                  className="appMenu__item"
                  onClick={() => { setMenuOpen(false); handleExport(); }}
                >
                  <Upload size={14} />
                  <span>导出全部为 CSV</span>
                </button>
                <hr className="appMenu__sep" />
                <button
                  className="appMenu__item"
                  onClick={() => { setMenuOpen(false); setShowAbout(true); }}
                >
                  <Info size={14} />
                  <span>关于</span>
                </button>
              </div>
            )}
          </div>
          <div className="brandmark">
            <div className="brandmark__box"><VaultIcon size={22} /></div>
            <div className="brandmark__text">
              <div className="brandmark__name">PASSAFETY</div>
              <div className="brandmark__tag">UNLOCKED · LOCAL VAULT</div>
            </div>
          </div>
        </div>

        <div className="topbar__center">
          <div className="search">
            <Search size={14} />
            <input
              className="search__input"
              placeholder="搜索：标题、用户名、分组、备注…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="search__kbd">/</span>
          </div>
        </div>

        <div className="topbar__right">
          <button
            className="iconBtn iconBtn--ghost"
            onClick={toggleTheme}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="topbar__sep" />
          <button className="btnGhost" onClick={handleImport}>
            <Download size={14} />
            <span>导入</span>
          </button>
          <button className="btnGhost" onClick={handleExport}>
            <Upload size={14} />
            <span>导出</span>
          </button>
          <div className="topbar__sep" />
          <button
            className="btnPrimary btnPrimary--sm"
            onClick={() => { setEditEntry(null); setShowForm(true); }}
          >
            <Plus size={14} />
            <span>添加</span>
          </button>
          <button className="btnLock" onClick={handleLockClick}>
            <Lock size={14} />
            <span>锁定</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="vault">
        <Sidebar onAddGroupClick={() => setShowAddGroup(true)} />

        <EntryTable
          entries={filtered}
          selectedId={currentSelected?.id ?? null}
          onSelect={setSelectedEntry}
          onEdit={handleEdit}
          onCopy={handleCopy}
          selectedGroupLabel={groupLabel}
          revealed={revealed}
          onToggleReveal={toggleReveal}
        />
      </div>

      {/* Status bar */}
      <div className="statusbar">
        <div className="statusbar__l">
          <span className="dot dot--ok" />
          <span>LOCAL DB</span>
          <span className="sep">·</span>
          <span className="mono">AES-256-GCM</span>
          <span className="sep">·</span>
          <span>PBKDF2-SHA256</span>
        </div>
        <div className="statusbar__c">
          <span className="mono muted">PORTABLE · ./vault.db</span>
        </div>
        <div className="statusbar__r">
          <span>{filtered.length} OF {entries.length}</span>
          <span className="sep">·</span>
          <span>v3.4.0</span>
        </div>
      </div>

      {/* Entry form modal */}
      {showForm && (
        <EntryForm
          entry={editEntry}
          defaultGroup={selectedGroup !== '全部' ? selectedGroup : undefined}
          onClose={() => { setShowForm(false); setEditEntry(null); }}
        />
      )}

      {/* Add group modal */}
      {showAddGroup && (
        <div className="modalBackdrop" onClick={() => setShowAddGroup(false)}>
          <form
            className="formCard modalCard"
            style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddGroup}
          >
            <div className="formCard__head">
              <div className="formCard__id">GROUP.NEW · 新建分组</div>
              <button
                type="button"
                className="iconBtn iconBtn--ghost"
                onClick={() => setShowAddGroup(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="field">
              <label className="field__lbl">
                <span>分组名称</span>
              </label>
              <input
                className="field__input--plain"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="例如：工作 / 个人 / 服务器"
                autoFocus
              />
            </div>
            <div className="formCard__foot">
              <div />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btnGhost" onClick={() => setShowAddGroup(false)}>取消</button>
                <button type="submit" className="btnPrimary btnPrimary--sm">创建</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* About modal */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* Change master password modal */}
      {showChangePwd && (
        <ChangePasswordModal onClose={() => { setShowChangePwd(false); useVaultStore.getState().clearError(); }} />
      )}

      {/* Lock confirmation */}
      {confirmLock && (
        <ConfirmDialog
          title="锁定密码库"
          message="锁定后将从内存擦除主密钥，所有未复制的密码需要重新解锁。继续？"
          confirmText="锁定"
          cancelText="取消"
          danger
          onConfirm={handleLockConfirm}
          onCancel={() => setConfirmLock(false)}
        />
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="modalBackdrop" style={{ background: 'rgba(5,6,9,0.5)' }}>
          <div
            className="formCard"
            style={{
              padding: '24px 32px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.18em',
              color: 'var(--amber)',
            }}
          >
            PROCESSING…
          </div>
        </div>
      )}
    </div>
  );
}
