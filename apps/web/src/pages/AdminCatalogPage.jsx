import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCm, formatMoney } from '@planner/shared';
import { useAuth } from '../auth/AuthContext.jsx';
import { adminApi } from '../admin/adminApi.js';
import AdminShell from '../admin/AdminShell.jsx';
import ProductEditor from '../admin/ProductEditor.jsx';
import PropertyDictionary from '../admin/PropertyDictionary.jsx';
import SectionTree from '../admin/SectionTree.jsx';

function flatten(nodes, depth = 0) {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flatten(node.children || [], depth + 1),
  ]);
}

export default function AdminCatalogPage() {
  const { user, loading, isAdmin } = useAuth();
  const [sections, setSections] = useState([]);
  const [products, setProducts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);

  const flatSections = useMemo(() => flatten(sections), [sections]);
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        String(product.sku || '').toLowerCase().includes(query),
    );
  }, [products, search]);

  async function loadSections() {
    const data = await adminApi.listSections();
    setSections(data);
    return data;
  }

  async function loadProducts(sectionId = selectedSection) {
    const data = await adminApi.listProductsAll({ sectionId: sectionId || undefined });
    setProducts(data);
  }

  async function loadProperties() {
    setProperties(await adminApi.listProperties());
  }

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setBusy(true);
    Promise.all([adminApi.listSections(), adminApi.listProductsAll(), adminApi.listProperties()])
      .then(([sectionData, productData, propertyData]) => {
        if (cancelled) return;
        setSections(sectionData);
        setProducts(productData);
        setProperties(propertyData);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  async function selectSection(sectionId) {
    setSelectedSection(sectionId);
    setSelectedProduct(null);
    setCreating(false);
    setError('');
    try {
      await loadProducts(sectionId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openProduct(id) {
    setBusy(true);
    setError('');
    try {
      const product = await adminApi.getProduct(id);
      setSelectedProduct(product);
      setCreating(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaved(product) {
    setSelectedProduct(product);
    setCreating(false);
    setNotice('Изменения сохранены');
    await Promise.all([loadProducts(), loadSections()]);
  }

  async function handleDeleted() {
    setSelectedProduct(null);
    setCreating(false);
    setNotice('Товар скрыт из каталога');
    await Promise.all([loadProducts(), loadSections()]);
  }

  async function refreshDictionary() {
    await loadProperties();
    setNotice('Справочник обновлён');
  }

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
        <p className="muted">Каталог доступен администратору.</p>
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
    <section className="admin-catalog-page">
      <AdminShell
        eyebrow="Админка · каталог"
        title="Каталог и 3D-модели"
        subtitle={`Разделы, карточки товаров, свойства и параметры. ${user.name || user.email}.`}
      >
      {notice && <div className="alert alert-ok">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="admin-catalog">
        <SectionTree
          sections={sections}
          selectedId={selectedSection}
          onSelect={selectSection}
          onRefresh={async () => {
            await loadSections();
            await loadProducts();
          }}
          onError={setError}
        />

        <section className="admin-panel product-list-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Товары</p>
              <h2>{selectedSection ? flatSections.find((item) => item.id === selectedSection)?.name : 'Все'}</h2>
            </div>
            <button
              className="button button-small"
              type="button"
              onClick={() => {
                setSelectedProduct(null);
                setCreating(true);
                setError('');
              }}
            >
              + Товар
            </button>
          </div>

          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию или SKU"
          />

          <div className="product-list">
            {busy && <p className="muted small">Загружаем…</p>}
            {!busy && visibleProducts.length === 0 && <p className="muted small">Товаров нет.</p>}
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className={`product-row ${selectedProduct?.id === product.id ? 'active' : ''}`}
                onClick={() => openProduct(product.id)}
              >
                <span className="product-row-main">
                  <strong>{product.name}</strong>
                  <small>
                    {formatCm(product.widthCm)} × {formatCm(product.depthCm)} × {formatCm(product.heightCm)}
                  </small>
                </span>
                <span className="product-row-side">
                  <strong>{product.priceKopecks > 0 ? formatMoney(product.priceKopecks) : 'По запросу'}</strong>
                  <small className={product.isActive ? 'ok-text' : 'warn-text'}>
                    {product.isActive ? 'опубликован' : 'скрыт'}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>

        {creating || selectedProduct ? (
          <ProductEditor
            key={selectedProduct?.id || 'new'}
            product={selectedProduct}
            sections={flatSections}
            properties={properties}
            defaultSectionId={selectedSection}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            onOpenDictionary={() => setDictionaryOpen(true)}
            onError={setError}
          />
        ) : (
          <div className="admin-panel empty-editor">
            <h2>Выберите товар</h2>
            <p className="muted">Слева — разделы, в центре — товары. Или создайте новый товар.</p>
          </div>
        )}
      </div>

      {dictionaryOpen && (
        <div className="modal-backdrop" onClick={() => setDictionaryOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <PropertyDictionary
              properties={properties}
              onRefresh={refreshDictionary}
              onClose={() => setDictionaryOpen(false)}
              onError={setError}
            />
          </div>
        </div>
      )}
      </AdminShell>
    </section>
  );
}
