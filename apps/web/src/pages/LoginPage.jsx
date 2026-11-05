import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const adminHome = user?.role === 'admin' ? '/admin/catalog' : '/admin/orders';

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'manager') navigate(adminHome, { replace: true });
  }, [adminHome, user, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const loggedUser = await login(email, password);
      const target = loggedUser.role === 'admin'
        ? '/admin/catalog'
        : loggedUser.role === 'manager' ? '/admin/orders' : '/';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <section className="card page narrow">
        <p className="muted">Проверяем сессию…</p>
      </section>
    );
  }

  if (user) {
    return (
      <section className="card page narrow">
        <h1>Вы уже вошли</h1>
        <p className="muted">
          {user.name || user.email} · {user.role}
        </p>
        <Link className="button" to={user.role === 'admin' || user.role === 'manager' ? adminHome : '/'}>
          Продолжить
        </Link>
      </section>
    );
  }

  return (
    <section className="card page narrow">
      <p className="eyebrow">Служебный вход</p>
      <h1>Вход в админку</h1>
      <p className="muted small">Доступ для администраторов и менеджеров заказов.</p>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          E-mail
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="button" type="submit" disabled={pending || loading}>
          {pending ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </section>
  );
}
