import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Folder, Shield, Plus, Trash2 } from 'lucide-react';
import { useVaultStore } from '../../stores/vaultStore';
import ConfirmDialog from '../ui/ConfirmDialog';

interface SidebarProps {
  onAddGroupClick: () => void;
}

function ContextMenu({
  x, y, groupName, onClose, onDelete,
}: {
  x: number; y: number; groupName: string;
  onClose: () => void; onDelete: (name: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const r = menuRef.current.getBoundingClientRect();
      const finalX = x + r.width > window.innerWidth ? window.innerWidth - r.width - 10 : x;
      const finalY = y + r.height > window.innerHeight ? window.innerHeight - r.height - 10 : y;
      menuRef.current.style.left = `${finalX}px`;
      menuRef.current.style.top = `${finalY}px`;
    }
  }, [x, y]);

  return createPortal(
    <div ref={menuRef} className="ctxMenu" style={{ left: x, top: y }}>
      <button
        className="ctxMenu__item ctxMenu__item--danger"
        onClick={() => { onDelete(groupName); onClose(); }}
      >
        <Trash2 size={13} />
        <span>删除分组</span>
      </button>
    </div>,
    document.body,
  );
}

const ENTRY_MIME = 'application/x-passafety-entry';

export default function Sidebar({ onAddGroupClick }: SidebarProps) {
  const { groups, entries, selectedGroup, setSelectedGroup, deleteGroup, moveEntryToGroup } = useVaultStore();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; groupName: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleGroupDragOver = (e: React.DragEvent, name: string) => {
    if (!e.dataTransfer.types.includes(ENTRY_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== name) setDropTarget(name);
  };

  const handleGroupDragLeave = (name: string) => {
    if (dropTarget === name) setDropTarget(null);
  };

  const handleGroupDrop = async (e: React.DragEvent, name: string) => {
    if (!e.dataTransfer.types.includes(ENTRY_MIME)) return;
    e.preventDefault();
    setDropTarget(null);
    const id = Number(e.dataTransfer.getData(ENTRY_MIME));
    if (!id) return;
    await moveEntryToGroup(id, name);
  };

  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  // Real vault health derived from currently loaded entries
  const health = useMemo(() => {
    if (entries.length === 0) {
      return { score: 0, total: 0, strong: 0, weak: 0, short: 0 };
    }
    let strong = 0;
    let weak = 0;
    let short = 0;
    for (const e of entries) {
      const len = e.password.length;
      const hasUpper = /[A-Z]/.test(e.password);
      const hasLower = /[a-z]/.test(e.password);
      const hasDigit = /[0-9]/.test(e.password);
      const hasSym = /[^a-zA-Z0-9]/.test(e.password);
      const variety = [hasUpper, hasLower, hasDigit, hasSym].filter(Boolean).length;
      if (len < 8) short++;
      if (len >= 12 && variety >= 3) strong++;
      else if (len < 10 || variety <= 1) weak++;
    }
    const score = Math.round((strong / entries.length) * 100);
    return { score, total: entries.length, strong, weak, short };
  }, [entries]);

  const handleContextMenu = (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    if (name !== '默认分组') setCtxMenu({ x: e.clientX, y: e.clientY, groupName: name });
  };

  const confirmDeleteGroup = async () => {
    if (deleteConfirm) {
      await deleteGroup(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  return (
    <aside className="side">
      <div className="side__h">
        <span>GROUPS · 分组</span>
        <button className="side__add" onClick={onAddGroupClick} title="新建分组">
          <Plus size={12} />
        </button>
      </div>

      <nav className="side__list">
        <button
          className={`grp ${selectedGroup === '全部' ? 'is-active' : ''}`}
          onClick={() => setSelectedGroup('全部')}
        >
          <span className="grp__icon"><Shield size={13} /></span>
          <span className="grp__name">全部条目</span>
          <span className="grp__cnt">{String(totalCount).padStart(2, '0')}</span>
        </button>

        {groups.map((g) => (
          <button
            key={g.name}
            className={`grp ${selectedGroup === g.name ? 'is-active' : ''} ${dropTarget === g.name ? 'is-drop' : ''}`}
            onClick={() => setSelectedGroup(g.name)}
            onContextMenu={(e) => handleContextMenu(e, g.name)}
            onDragOver={(e) => handleGroupDragOver(e, g.name)}
            onDragEnter={(e) => handleGroupDragOver(e, g.name)}
            onDragLeave={() => handleGroupDragLeave(g.name)}
            onDrop={(e) => handleGroupDrop(e, g.name)}
          >
            <span className="grp__icon"><Folder size={13} /></span>
            <span className="grp__name">{g.name}</span>
            <span className="grp__cnt">{String(g.count).padStart(2, '0')}</span>
          </button>
        ))}
      </nav>

      <div className="side__hr" />

      <div className="health">
        <div className="health__head">
          <span>VAULT HEALTH</span>
          <span className="health__pct">{health.total > 0 ? health.score : '—'}</span>
        </div>
        <div className="health__bar">
          <div className="health__bar-fg" style={{ width: `${health.total > 0 ? health.score : 0}%` }} />
        </div>
        <div className="health__rows">
          <div className="health__row"><span>强密码</span><span>{health.strong} / {health.total}</span></div>
          <div className="health__row"><span>偏弱</span><span className={health.weak > 0 ? 'warn-t' : 'ok-t'}>{health.weak}</span></div>
          <div className="health__row"><span>过短 (&lt;8)</span><span className={health.short > 0 ? 'err-t' : 'ok-t'}>{health.short}</span></div>
        </div>
      </div>

      <div className="side__foot">
        <div className="side__user">
          <div className="avatar">PS</div>
          <div className="side__userMeta">
            <div className="side__userName">本地用户</div>
            <div className="side__userTag">LOCAL · THIS MACHINE</div>
          </div>
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          groupName={ctxMenu.groupName}
          onClose={() => setCtxMenu(null)}
          onDelete={(name) => setDeleteConfirm(name)}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title="删除分组"
          message={`确定要删除分组「${deleteConfirm}」吗？该分组下的条目将移动到默认分组。`}
          confirmText="删除"
          cancelText="取消"
          danger
          onConfirm={confirmDeleteGroup}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </aside>
  );
}
