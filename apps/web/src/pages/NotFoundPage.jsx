import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="card page narrow">
      <h1>404</h1>
      <p className="muted">Страница не найдена.</p>
      <Link className="button" to="/">
        На главную
      </Link>
    </section>
  );
}
