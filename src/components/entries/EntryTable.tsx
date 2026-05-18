import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Copy, Pencil, Trash2, Folder, RefreshCw, FolderInput, Upload, X } from 'lucide-react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { VaultEntry } from '../../types';
import { useVaultStore } from '../../stores/vaultStore';
import ConfirmDialog from '../ui/ConfirmDialog';

interface EntryTableProps {
  entries: VaultEntry[];
  selectedId: number | null;
  onSelect: (entry: VaultEntry | null) => void;
  onEdit: (entry: VaultEntry) => void;
  onCopy: (value: string) => void;
  onCopyPassword: (value: string) => void;
  selectedGroupLabel: string;
  revealed: Set<number>;
  onToggleReveal: (id: number) => void;
}

const COL_KEYS = ['title', 'username', 'password', 'group', 'note'] as const;
type ColKey = typeof COL_KEYS[number];

const DEFAULT_WIDTHS: Record<ColKey, number> = {
  title: 150,
  username: 130,
  password: 250,
  group: 100,
  note: 160,
};

const MIN_WIDTH = 80;
const STORAGE_KEY = 'passafety:col-widths:v4';

function ContextMenu({
  x, y, entry, onClose, onCopyUsername, onCopyPassword, onEdit, onDelete,
}: {
  x: number; y: number; entry: VaultEntry; onClose: () => void;
  onCopyUsername: (v: string) => void; onCopyPassword: (v: string) => void;
  onEdit: (e: VaultEntry) => void; onDelete: (e: VaultEntry) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [onClose]);

  useEffect(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      const nx = x + r.width > window.innerWidth ? window.innerWidth - r.width - 10 : x;
      const ny = y + r.height > window.innerHeight ? window.innerHeight - r.height - 10 : y;
      ref.current.style.left = `${nx}px`;
      ref.current.style.top = `${ny}px`;
    }
  }, [x, y]);

  return createPortal(
    <div ref={ref} className="ctxMenu" style={{ left: x, top: y }}>
      <button className="ctxMenu__item" onClick={() => { onCopyUsername(entry.username); onClose(); }}>
        <Copy size={13} /><span>复制用户名</span>
      </button>
      <button className="ctxMenu__item" onClick={() => { onCopyPassword(entry.password); onClose(); }}>
        <Copy size={13} /><span>复制密码</span>
      </button>
      <hr className="ctxMenu__sep" />
      <button className="ctxMenu__item" onClick={() => { onEdit(entry); onClose(); }}>
        <Pencil size={13} /><span>编辑</span>
      </button>
      <button className="ctxMenu__item ctxMenu__item--danger" onClick={() => { onDelete(entry); onClose(); }}>
        <Trash2 size={13} /><span>删除</span>
      </button>
    </div>,
    document.body,
  );
}

export default function EntryTable({
  entries, selectedId, onSelect, onEdit, onCopy, onCopyPassword, selectedGroupLabel,
  revealed, onToggleReveal,
}: EntryTableProps) {
  const { deleteEntry, loadEntries, loadGroups, reorderEntries, moveEntriesToGroup, exportSelectedCsv, groups } = useVaultStore();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: VaultEntry } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ kind: 'single'; entry: VaultEntry } | { kind: 'batch' } | null>(null);
  const [copyMenu, setCopyMenu] = useState<{ entry: VaultEntry; x: number; y: number } | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveGroup, setBulkMoveGroup] = useState<string>('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: 'before' | 'after' } | null>(null);
  const draggedIdRef = useRef<number | null>(null);

  // Close copy menu on outside click
  useEffect(() => {
    if (!copyMenu) return;
    const off = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.ctxMenu')) setCopyMenu(null);
    };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [copyMenu]);

  const ENTRY_MIME = 'application/x-passafety-entry';

  const handleRowDragStart = (e: React.DragEvent, id: number) => {
    draggedIdRef.current = id;
    setDragId(id);
    e.dataTransfer.setData(ENTRY_MIME, String(id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRowDragOver = (e: React.DragEvent, targetId: number) => {
    if (!e.dataTransfer.types.includes(ENTRY_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIdRef.current === targetId) {
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pos: 'before' | 'after' = y < rect.height / 2 ? 'before' : 'after';
    setDropTarget((cur) =>
      cur && cur.id === targetId && cur.pos === pos ? cur : { id: targetId, pos },
    );
  };

  const handleRowDrop = (e: React.DragEvent, targetId: number) => {
    if (!e.dataTransfer.types.includes(ENTRY_MIME)) return;
    e.preventDefault();
    const sourceId = Number(e.dataTransfer.getData(ENTRY_MIME)) || draggedIdRef.current;
    const pos = dropTarget && dropTarget.id === targetId ? dropTarget.pos : 'after';
    setDropTarget(null);
    setDragId(null);
    draggedIdRef.current = null;
    if (!sourceId || sourceId === targetId) return;

    const ids = entries.map((x) => x.id);
    const fromIdx = ids.indexOf(sourceId);
    if (fromIdx < 0) return;
    ids.splice(fromIdx, 1);
    const toIdx = ids.indexOf(targetId);
    if (toIdx < 0) return;
    const insertIdx = pos === 'before' ? toIdx : toIdx + 1;
    ids.splice(insertIdx, 0, sourceId);
    reorderEntries(ids);
  };

  const handleRowDragEnd = () => {
    setDragId(null);
    setDropTarget(null);
    draggedIdRef.current = null;
  };

  const [widths, setWidths] = useState<Record<ColKey, number>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged = { ...DEFAULT_WIDTHS };
        for (const k of COL_KEYS) {
          if (typeof parsed[k] === 'number' && parsed[k] >= MIN_WIDTH) merged[k] = parsed[k];
        }
        return merged;
      }
    } catch {}
    return DEFAULT_WIDTHS;
  });
  const [draggingCol, setDraggingCol] = useState<ColKey | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)); } catch {}
  }, [widths]);

  const gridTemplate = useMemo(
    () => `44px ${widths.title}px ${widths.username}px ${widths.password}px ${widths.group}px ${widths.note}px 110px`,
    [widths],
  );

  const startResize = (e: React.PointerEvent, key: ColKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    setDraggingCol(key);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      const next = Math.max(MIN_WIDTH, startW + (ev.clientX - startX));
      setWidths((w) => ({ ...w, [key]: next }));
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDraggingCol(null);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const toggleCheck = (id: number) => {
    setChecked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setChecked((p) => (p.size === entries.length ? new Set() : new Set(entries.map((e) => e.id))));
  };

  const confirmDelete = async () => {
    if (!confirmDel) return;
    if (confirmDel.kind === 'single') {
      await deleteEntry(confirmDel.entry.id);
      if (selectedId === confirmDel.entry.id) onSelect(null);
    } else {
      for (const id of checked) await deleteEntry(id);
      if (selectedId !== null && checked.has(selectedId)) onSelect(null);
      setChecked(new Set());
    }
    setConfirmDel(null);
  };

  const allChecked = entries.length > 0 && checked.size === entries.length;

  return (
    <main className="table">
      <div className="tableHead">
        <div className="tableHead__l">
          <div className="crumbs">
            <span className="crumbs__l">VAULT</span>
            <span style={{ color: 'var(--ink-5)' }}>›</span>
            <span className="crumbs__l">{selectedGroupLabel.toUpperCase()}</span>
          </div>
          <div className="tableHead__count">
            <span className="tableHead__num">{String(entries.length).padStart(2, '0')}</span>
            <span className="tableHead__lbl">条目</span>
            {checked.size > 0 && <span className="tableHead__sel">· {checked.size} 已选</span>}
          </div>
        </div>
        <div className="tableHead__r">
          {checked.size > 0 && (
            <>
              <button
                className="btnGhost"
                onClick={() => {
                  setBulkMoveGroup(groups[0]?.name || '默认分组');
                  setBulkMoveOpen(true);
                }}
              >
                <FolderInput size={13} />
                <span>批量修改分组</span>
              </button>
              <button
                className="btnGhost"
                onClick={async () => {
                  const path = await saveDialog({
                    defaultPath: `passafety-selected-${checked.size}.csv`,
                    filters: [{ name: 'CSV', extensions: ['csv'] }],
                  });
                  if (path) {
                    await exportSelectedCsv(path as string, Array.from(checked));
                  }
                }}
              >
                <Upload size={13} />
                <span>批量导出</span>
              </button>
              <button className="btnLock" onClick={() => setConfirmDel({ kind: 'batch' })}>
                <Trash2 size={13} />
                <span>批量删除</span>
              </button>
            </>
          )}
          <button
            className="iconBtn iconBtn--ghost"
            title="刷新"
            onClick={() => { loadEntries(); loadGroups(); }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="tableEmpty">
          <div className="tableEmpty__icon"><Folder size={28} /></div>
          <div className="tableEmpty__title">暂无密码条目</div>
          <div className="tableEmpty__sub">点击右上角「添加」创建新条目</div>
        </div>
      ) : (
        <div className="grid">
          <div className="row row--head" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="cell cell--check">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            </div>
            <div className="cell">
              <span>标题</span>
              <div
                className={`resizer ${draggingCol === 'title' ? 'is-active' : ''}`}
                onPointerDown={(e) => startResize(e, 'title')}
              />
            </div>
            <div className="cell">
              <span>用户名</span>
              <div
                className={`resizer ${draggingCol === 'username' ? 'is-active' : ''}`}
                onPointerDown={(e) => startResize(e, 'username')}
              />
            </div>
            <div className="cell">
              <span>密码</span>
              <div
                className={`resizer ${draggingCol === 'password' ? 'is-active' : ''}`}
                onPointerDown={(e) => startResize(e, 'password')}
              />
            </div>
            <div className="cell">
              <span>分组</span>
              <div
                className={`resizer ${draggingCol === 'group' ? 'is-active' : ''}`}
                onPointerDown={(e) => startResize(e, 'group')}
              />
            </div>
            <div className="cell">
              <span>备注</span>
              <div
                className={`resizer ${draggingCol === 'note' ? 'is-active' : ''}`}
                onPointerDown={(e) => startResize(e, 'note')}
              />
            </div>
            <div className="cell cell--ops"><span>操作</span></div>
          </div>

          {entries.map((r) => {
            const isRev = revealed.has(r.id);
            const isSel = selectedId === r.id;
            const isDragging = dragId === r.id;
            const dropPos = dropTarget && dropTarget.id === r.id ? dropTarget.pos : null;
            return (
              <div
                key={r.id}
                className={`row ${isSel ? 'is-sel' : ''} ${isDragging ? 'is-dragging' : ''} ${dropPos ? `is-drop-${dropPos}` : ''}`}
                style={{ gridTemplateColumns: gridTemplate }}
                draggable
                onDragStart={(e) => handleRowDragStart(e, r.id)}
                onDragOver={(e) => handleRowDragOver(e, r.id)}
                onDrop={(e) => handleRowDrop(e, r.id)}
                onDragEnd={handleRowDragEnd}
                onClick={() => onSelect(r)}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, entry: r }); }}
              >
                <div className="cell cell--check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleCheck(r.id)} />
                </div>
                <div className="cell">
                  <div className="titleCell__name" title={r.website}>{r.website}</div>
                </div>
                <div className="cell cell--user" title={r.username}>{r.username || '—'}</div>
                <div className="cell" onClick={(e) => e.stopPropagation()}>
                  <span className="pwdCell">
                    <span className={`pwd ${isRev ? 'is-rev' : ''}`}>
                      {isRev ? r.password : '••••••••••••'}
                    </span>
                    <button
                      className="pwd__eye"
                      onClick={() => onToggleReveal(r.id)}
                      title={isRev ? '隐藏' : '显示'}
                    >
                      {isRev ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </span>
                </div>
                <div className="cell">
                  <span className="tag" title={r.group}>{r.group}</span>
                </div>
                <div className="cell cell--note">
                  <span className="noteCell" title={r.comment}>{r.comment || '—'}</span>
                </div>
                <div className="cell cell--ops" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="rowBtn"
                    title="复制…"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setCopyMenu({ entry: r, x: rect.right - 160, y: rect.bottom + 4 });
                    }}
                  >
                    <Copy size={13} />
                  </button>
                  <button className="rowBtn" title="编辑" onClick={() => onEdit(r)}><Pencil size={13} /></button>
                  <button
                    className="rowBtn rowBtn--danger"
                    title="删除"
                    onClick={() => setConfirmDel({ kind: 'single', entry: r })}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="tableFoot">
        <div className="tableFoot__l">
          <span className="kbd">←→</span><span className="muted">切换分组</span>
          <span className="kbd">空格</span><span className="muted">显示密码</span>
          <span className="kbd">Ctrl C</span><span className="muted">复制</span>
        </div>
        <div className="tableFoot__r">
          <span className="dot dot--ok" />
          <span>UNLOCKED</span>
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          entry={ctxMenu.entry}
          onClose={() => setCtxMenu(null)}
          onCopyUsername={onCopy}
          onCopyPassword={onCopyPassword}
          onEdit={onEdit}
          onDelete={(e) => setConfirmDel({ kind: 'single', entry: e })}
        />
      )}

      {copyMenu && createPortal(
        <div
          className="ctxMenu"
          style={{ left: copyMenu.x, top: copyMenu.y, position: 'fixed' }}
        >
          <button
            className="ctxMenu__item"
            onClick={() => { onCopy(copyMenu.entry.username); setCopyMenu(null); }}
          >
            <Copy size={13} /><span>复制用户名</span>
          </button>
          <button
            className="ctxMenu__item"
            onClick={() => { onCopyPassword(copyMenu.entry.password); setCopyMenu(null); }}
          >
            <Copy size={13} /><span>复制密码</span>
          </button>
        </div>,
        document.body,
      )}

      {confirmDel && (
        <ConfirmDialog
          title="确认删除"
          message={
            confirmDel.kind === 'single'
              ? `确定要删除「${confirmDel.entry.website}」吗？此操作不可撤销。`
              : `确定要删除选中的 ${checked.size} 个条目吗？此操作不可撤销。`
          }
          confirmText="删除"
          cancelText="取消"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {bulkMoveOpen && (
        <div className="modalBackdrop" onClick={() => setBulkMoveOpen(false)}>
          <form
            className="formCard modalCard entryForm"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              await moveEntriesToGroup(Array.from(checked), bulkMoveGroup);
              setChecked(new Set());
              setBulkMoveOpen(false);
            }}
          >
            <div className="formCard__head">
              <div className="formCard__id">批量修改分组</div>
              <button type="button" className="iconBtn iconBtn--ghost" onClick={() => setBulkMoveOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="modalCard__body">
              <div className="field">
                <label className="field__lbl">
                  <span>目标分组</span>
                  <span className="field__hint">已选 {checked.size} 个条目</span>
                </label>
                <select
                  className="field__select"
                  value={bulkMoveGroup}
                  onChange={(e) => setBulkMoveGroup(e.target.value)}
                  autoFocus
                >
                  {groups.map((g) => (
                    <option key={g.name} value={g.name}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="formCard__foot">
              <div />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btnGhost" onClick={() => setBulkMoveOpen(false)}>取消</button>
                <button type="submit" className="btnPrimary btnPrimary--sm">
                  <span>移动</span>
                  <span className="btnPrimary__kbd">↵</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
