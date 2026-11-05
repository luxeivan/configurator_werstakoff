import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AdminHomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="muted">Проверяем сессию…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'admin') {
    return <Navigate to="/admin/catalog" replace />;
  }
  if (user.role === 'manager') {
    return <Navigate to="/admin/orders" replace />;
  }
  return <Navigate to="/" replace />;
}
