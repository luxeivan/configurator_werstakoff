import { Router } from 'express';
import { listProperties } from '../services/properties.js';
import { listProducts, getProductByPublicId } from '../services/products.js';
import { listSections } from '../services/sections.js';

export const catalogRouter = Router();

function activeTree(nodes) {
  return nodes
    .filter((node) => node.isActive)
    .map((node) => ({ ...node, children: activeTree(node.children || []) }));
}

catalogRouter.get('/tree', async (_req, res) => {
  res.json({ data: activeTree(await listSections()) });
});

catalogRouter.get('/filters', async (_req, res) => {
  res.json({
    data: {
      sections: activeTree(await listSections()),
      properties: await listProperties({ filterableOnly: true }),
    },
  });
});

catalogRouter.get('/products', async (req, res) => {
  const result = await listProducts({
    sectionId: req.query.sectionId,
    q: req.query.q,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    maxWidth: req.query.maxWidth,
    maxDepth: req.query.maxDepth,
    maxHeight: req.query.maxHeight,
    sort: req.query.sort,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json({
    data: result.items,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

catalogRouter.get('/products/:publicId', async (req, res) => {
  const product = await getProductByPublicId(req.params.publicId);
  if (!product) {
    return res.status(404).json({
      error: { code: 'PRODUCT_NOT_FOUND', message: 'Товар не найден' },
    });
  }
  res.json({ data: product });
});
