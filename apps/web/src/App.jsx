import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import PlannerPage from './pages/PlannerPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AdminHomePage from './pages/AdminHomePage.jsx';
import AdminPropertiesPage from './pages/AdminPropertiesPage.jsx';
import AdminCatalogPage from './pages/AdminCatalogPage.jsx';
import AdminOrdersPage from './pages/AdminOrdersPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

const nav = [
  { to: '/', label: 'Планировщик', end: true },
  { to: '/orders', label: 'Мои заказы' },
  { to: '/admin', label: 'Админка' },
];

const ROLE_LABELS = {
  admin: 'администратор',
  manager: 'менеджер',
  customer: 'покупатель',
};

export default function App() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">Fe</span>
          <span>
            <strong>МеталлПлан</strong>
            <small>3D-планировщик</small>
          </span>
        </NavLink>
        <nav className="nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {loading ? (
          <span className="muted small">проверка сессии…</span>
        ) : user ? (
          <div className="user-box">
            <span className="user-chip" title={user.email}>
              {user.name || user.email}
              <small>{ROLE_LABELS[user.role] || user.role}</small>
            </span>
            <button type="button" className="button button-ghost button-small" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="button button-ghost">
            Войти
          </NavLink>
        )}
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<PlannerPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/admin" element={<AdminHomePage />} />
          <Route path="/admin/catalog" element={<AdminCatalogPage />} />
          <Route path="/admin/properties" element={<AdminPropertiesPage />} />
          <Route path="/admin/settings" element={<AdminPage />} />
          <Route path="/admin/orders" element={<AdminOrdersPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
