import { useEffect } from 'react';
import { useVaultStore } from './stores/vaultStore';
import UnlockScreen from './components/unlock/UnlockScreen';
import MainLayout from './components/layout/MainLayout';

function App() {
  const { isLocked, checkInitialized } = useVaultStore();

  // Check if vault exists on mount
  useEffect(() => {
    checkInitialized();
  }, [checkInitialized]);

  // Suppress native right-click everywhere except on password entry rows,
  // which mount their own context menu via onContextMenu.
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('.row') && !t.closest('.row--head')) return;
      e.preventDefault();
    };
    document.addEventListener('contextmenu', onCtx);
    return () => document.removeEventListener('contextmenu', onCtx);
  }, []);

  if (isLocked) {
    return <UnlockScreen />;
  }

  return <MainLayout />;
}

export default App;