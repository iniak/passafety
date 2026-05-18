export interface VaultEntry {
  id: number;
  website: string;
  username: string;
  password: string;
  comment: string;
  group: string;
}

export interface Group {
  name: string;
  count: number;
}

export type ThemeMode = 'dark' | 'light';

/** Tracks the auto-clearing clipboard countdown after a password is copied. */
export interface ClipboardGuard {
  /** Epoch ms at which the clipboard auto-clear fires. */
  clearAt: number;
  /** 'counting' while the timer runs, 'cleared' for the brief post-clear notice. */
  phase: 'counting' | 'cleared';
}

export interface VaultState {
  isLocked: boolean;
  isInitialized: boolean;
  passwordHint: string;
  entries: VaultEntry[];
  groups: Group[];
  selectedGroup: string;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  theme: ThemeMode;
  clipboardGuard: ClipboardGuard | null;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: number;
}