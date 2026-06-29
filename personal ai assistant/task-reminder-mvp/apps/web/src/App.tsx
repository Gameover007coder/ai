import React, { useEffect } from 'react';
import { useAuthStore } from './stores/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OverlayWidget from './components/OverlayWidget';

export default function App() {
  const token = useAuthStore((s) => s.token);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  if (!token) return <Login />;
  return (
    <>
      <Dashboard />
      <OverlayWidget />
    </>
  );
}
