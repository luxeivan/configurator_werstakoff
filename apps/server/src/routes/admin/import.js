import { Router } from 'express';
import { httpError } from '../../utils/httpError.js';
import { zipUpload } from '../../middleware/upload.js';
import { startCatalogImport, getCatalogImportStatus } from '../../services/catalogImport.js';
import { writeAudit } from '../../services/audit.js';

export const adminImportRouter = Router();

adminImportRouter.post('/', zipUpload.single('file'), async (req, res) => {
  if (!req.file) throw httpError(400, 'FILE_REQUIRED', 'Выберите ZIP-архив');
  const manifestPath = String(req.body?.manifest || '').trim() || null;
  const createParams = ['1', 'true', 'on', 'да'].includes(String(req.body?.createParams || '').trim().toLowerCase());
  const id = await startCatalogImport({
    zipPath: req.file.path,
    manifestPath,
    createParams,
    actorUserId: req.session.userId,
  });
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'catalog.import.start',
    entityType: 'import',
    entityId: id,
    meta: { sizeBytes: req.file.size, manifest: manifestPath, createParams },
    req,
  });
  res.status(202).json({ data: { id } });
});

adminImportRouter.get('/:id', async (req, res) => {
  const status = getCatalogImportStatus(req.params.id);
  if (!status) throw httpError(404, 'IMPORT_NOT_FOUND', 'Импорт не найден');
  res.json({ data: status });
});
