import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { adminApi } from '../admin/adminApi.js';
import AdminShell from '../admin/AdminShell.jsx';
import PropertyDictionary from '../admin/PropertyDictionary.jsx';

export default function AdminPropertiesPage() {
  const { user, loading, isAdmin } = useAuth();
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState('');

  async function loadProperties() {
    const data = await adminApi.listProperties();
    setProperties(data);
  }

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    adminApi
      .listProperties()
      .then((data) => {
        if (!cancelled) setProperties(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (loading) {
    return (
      <section className="card page">
        <p className="muted">Проверяем сессию…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="card page narrow">
        <h1>Требуется вход</h1>
        <p className="muted">Справочник свойств доступен администратору.</p>
        <Link className="button" to="/login">Войти</Link>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="card page narrow">
        <h1>Недостаточно прав</h1>
        <p className="muted">Вы вошли как {user.name || user.email} ({user.role}).</p>
        <Link className="button button-ghost" to="/admin/orders">К заказам</Link>
      </section>
    );
  }

  return (
    <section className="admin-properties-page">
      <AdminShell
        eyebrow="Админка · свойства"
        title="Свойства товаров"
        subtitle={`Общий справочник свойств и параметров. ${user.name || user.email}.`}
      >
      {error && <div className="alert alert-error">{error}</div>}
      <PropertyDictionary properties={properties} onRefresh={loadProperties} onError={setError} />
      </AdminShell>
    </section>
  );
}
