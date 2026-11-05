import AdminTabs from './AdminTabs.jsx';

/**
 * Единая обложка админки: заголовок слева, вкладки справа, содержимое ниже.
 * Используется на всех четырёх страницах, чтобы вкладки не «прыгали».
 */
export default function AdminShell({ eyebrow, title, subtitle, children }) {
  return (
    <div className="admin-shell">
      <div className="hero compact admin-shell-head">
        <div className="admin-shell-info">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        <AdminTabs />
      </div>
      {children}
    </div>
  );
}