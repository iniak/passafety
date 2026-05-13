import { create } from 'zustand';
import { VaultEntry, Group, VaultState, ThemeMode } from '../types';
import { invoke } from '@tauri-apps/api/core';

const THEME_KEY = 'passafety:theme';

function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyThemeToBody(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  if (theme === 'light') document.body.classList.add('theme-light');
  else document.body.classList.remove('theme-light');
}

interface VaultActions {
  unlock: (password: string) => Promise<boolean>;
  setup: (password: string, hint: string) => Promise<boolean>;
  lock: () => void;
  getHint: () => Promise<string>;
  checkInitialized: () => Promise<boolean>;
  loadEntries: () => Promise<void>;
  addEntry: (entry: Omit<VaultEntry, 'id'>) => Promise<void>;
  updateEntry: (entry: VaultEntry) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
  reorderEntries: (orderedIds: number[]) => Promise<void>;
  moveEntryToGroup: (id: number, group: string) => Promise<void>;
  moveEntriesToGroup: (ids: number[], group: string) => Promise<void>;
  loadGroups: () => Promise<void>;
  addGroup: (name: string) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
  setSelectedGroup: (group: string) => void;
  setSearchQuery: (query: string) => void;
  exportCsv: (path: string) => Promise<void>;
  exportSelectedCsv: (path: string, ids: number[]) => Promise<void>;
  importCsv: (path: string) => Promise<void>;
  generatePassword: (options: PasswordOptions) => Promise<string>;
  changeMasterPassword: (oldPassword: string, newPassword: string, newHint: string) => Promise<boolean>;
  clearError: () => void;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

type VaultStore = VaultState & VaultActions;

export const useVaultStore = create<VaultStore>((set, get) => ({
  isLocked: true,
  isInitialized: false,
  passwordHint: '',
  entries: [],
  groups: [],
  selectedGroup: '全部',
  searchQuery: '',
  loading: false,
  error: null,
  theme: readStoredTheme(),

  unlock: async (password: string) => {
    set({ loading: true, error: null });
    try {
      const result = await invoke<boolean>('unlock_vault', { password });
      if (result) {
        set({ isLocked: false, loading: false });
        await get().loadEntries();
        await get().loadGroups();
        return true;
      }
      set({ loading: false, error: '密码错误' });
      return false;
    } catch (e) {
      set({ loading: false, error: String(e) });
      return false;
    }
  },

  setup: async (password: string, hint: string) => {
    set({ loading: true, error: null });
    try {
      const result = await invoke<boolean>('setup_vault', { password, hint });
      if (result) {
        set({ isLocked: false, isInitialized: true, loading: false });
        await get().loadGroups();
        return true;
      }
      set({ loading: false, error: '初始化失败' });
      return false;
    } catch (e) {
      set({ loading: false, error: String(e) });
      return false;
    }
  },

  lock: () => {
    invoke('lock_vault').catch(console.error);
    set({ isLocked: true, entries: [], selectedGroup: '全部' });
  },

  getHint: async () => {
    try {
      const hint = await invoke<string>('get_password_hint');
      set({ passwordHint: hint });
      return hint;
    } catch (e) {
      console.error(e);
      return '';
    }
  },

  checkInitialized: async () => {
    try {
      const initialized = await invoke<boolean>('is_vault_initialized');
      set({ isInitialized: initialized });
      return initialized;
    } catch (e) {
      console.error(e);
      set({ isInitialized: false });
      return false;
    }
  },

  loadEntries: async () => {
    const { selectedGroup } = get();
    try {
      const entries = await invoke<VaultEntry[]>('get_entries', {
        group: selectedGroup === '全部' ? null : selectedGroup
      });
      set({ entries });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addEntry: async (entry) => {
    set({ loading: true });
    try {
      await invoke('add_entry', {
        website: entry.website,
        username: entry.username,
        password: entry.password,
        comment: entry.comment,
        group: entry.group
      });
      await get().loadEntries();
      await get().loadGroups();
      set({ loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  updateEntry: async (entry) => {
    set({ loading: true });
    try {
      await invoke('update_entry', {
        id: entry.id,
        website: entry.website,
        username: entry.username,
        password: entry.password,
        comment: entry.comment,
        group: entry.group
      });
      await get().loadEntries();
      set({ loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  deleteEntry: async (id) => {
    set({ loading: true });
    try {
      await invoke('delete_entry', { id });
      await get().loadEntries();
      await get().loadGroups();
      set({ loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  reorderEntries: async (orderedIds) => {
    // Optimistic reorder for snappy UX; backend persistence follows
    const current = get().entries;
    const byId = new Map(current.map((e) => [e.id, e]));
    const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean) as VaultEntry[];
    if (reordered.length === current.length) {
      set({ entries: reordered });
    }
    try {
      await invoke('reorder_entries', { orderedIds });
    } catch (e) {
      set({ error: String(e) });
      await get().loadEntries();
    }
  },

  moveEntriesToGroup: async (ids, group) => {
    if (ids.length === 0) return;
    set({ loading: true });
    try {
      await invoke('move_entries_to_group', { ids, group });
      await get().loadEntries();
      await get().loadGroups();
      set({ loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  moveEntryToGroup: async (id, group) => {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry || entry.group === group) return;
    try {
      await invoke('update_entry', {
        id: entry.id,
        website: entry.website,
        username: entry.username,
        password: entry.password,
        comment: entry.comment,
        group,
      });
      await get().loadEntries();
      await get().loadGroups();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadGroups: async () => {
    try {
      const groups = await invoke<Group[]>('get_groups');
      set({ groups });
    } catch (e) {
      console.error(e);
    }
  },

  addGroup: async (name) => {
    try {
      await invoke('add_group', { name });
      await get().loadGroups();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteGroup: async (name) => {
    try {
      await invoke('delete_group', { name });
      await get().loadGroups();
      if (get().selectedGroup === name) {
        set({ selectedGroup: '全部' });
      }
      await get().loadEntries();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setSelectedGroup: (group) => {
    set({ selectedGroup: group });
    get().loadEntries();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  exportCsv: async (path) => {
    try {
      await invoke('export_csv', { path });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  exportSelectedCsv: async (path, ids) => {
    if (ids.length === 0) return;
    try {
      await invoke('export_csv_selected', { path, ids });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  importCsv: async (path) => {
    set({ loading: true });
    try {
      await invoke('import_csv', { path });
      await get().loadEntries();
      await get().loadGroups();
      set({ loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  generatePassword: async (options) => {
    try {
      return await invoke<string>('generate_password_cmd', { options });
    } catch (e) {
      console.error(e);
      return '';
    }
  },

  changeMasterPassword: async (oldPassword, newPassword, newHint) => {
    set({ loading: true, error: null });
    try {
      await invoke('change_master_password', { oldPassword, newPassword, newHint });
      set({ loading: false, passwordHint: newHint });
      return true;
    } catch (e) {
      set({ loading: false, error: String(e) });
      return false;
    }
  },

  clearError: () => set({ error: null }),

  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    applyThemeToBody(next);
    set({ theme: next });
  },

  setTheme: (theme) => {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    applyThemeToBody(theme);
    set({ theme });
  },
}));