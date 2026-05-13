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