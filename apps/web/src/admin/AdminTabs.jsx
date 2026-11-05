import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const TABS = [
  { to: '/admin/catalog', label: 'Каталог', adminOnly: true },
  { to: '/admin/properties', label: 'Свойства товаров', adminOnly: true },
  { to: '/admin/settings', label: 'Настройки', adminOnly: true },
  { to: '/admin/orders', label: 'Заказы', adminOnly: false },
];

export default function AdminTabs() {
  const { user } = useAuth();
  const visible = TABS.filter((tab) => !tab.adminOnly || user?.role === 'admin');
  return (
    <nav className="admin-tabs" aria-label="Разделы админки">
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) => `admin-tab${isActive ? ' active' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}