import { useEffect, useState } from 'react';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminPage } from './pages/AdminPage';
import { DetailPage } from './pages/DetailPage';
import { OverviewPage } from './pages/OverviewPage';

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();
  if (hash.startsWith('#/admin/login')) return <AdminLoginPage />;
  if (hash.startsWith('#/admin')) return <AdminPage />;
  const match = hash.match(/^#\/accounts\/(\d+)/);
  if (match) return <DetailPage mid={Number(match[1])} />;
  return <OverviewPage />;
}