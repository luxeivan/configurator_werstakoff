import { Router } from 'express';
import { httpError } from '../../utils/httpError.js';
import { parseBody } from '../../utils/validate.js';
import {
  paramCreateSchema,
  paramUpdateSchema,
  propertyCreateSchema,
  propertyUpdateSchema,
} from '../../validation/catalog.js';
import {
  addParam,
  createProperty,
  deleteParam,
  deleteProperty,
  listProperties,
  updateParam,
  updateProperty,
} from '../../services/properties.js';
import { writeAudit } from '../../services/audit.js';

export const adminPropertiesRouter = Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'INVALID_ID', 'Некорректный идентификатор');
  return id;
}

adminPropertiesRouter.get('/', async (_req, res) => {
  res.json({ data: await listProperties() });
});

adminPropertiesRouter.post('/', async (req, res) => {
  const input = parseBody(propertyCreateSchema, req.body);
  const property = await createProperty(input);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'property.create',
    entityType: 'property',
    entityId: property.publicId,
    meta: { name: property.name, type: property.type },
    req,
  });
  res.status(201).json({ data: property });
});

adminPropertiesRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const input = parseBody(propertyUpdateSchema, req.body);
  const property = await updateProperty(id, input);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'property.update',
    entityType: 'property',
    entityId: property.publicId,
    meta: { fields: Object.keys(input) },
    req,
  });
  res.json({ data: property });
});

adminPropertiesRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await deleteProperty(id);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'property.delete',
    entityType: 'property',
    entityId: String(id),
    req,
  });
  res.json({ data: { ok: true } });
});

adminPropertiesRouter.post('/:id/params', async (req, res) => {
  const id = parseId(req.params.id);
  const input = parseBody(paramCreateSchema, req.body);
  const param = await addParam(id, input);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'property.param.create',
    entityType: 'property',
    entityId: String(id),
    meta: { label: param.label },
    req,
  });
  res.status(201).json({ data: param });
});

adminPropertiesRouter.patch('/:id/params/:paramId', async (req, res) => {
  const id = parseId(req.params.id);
  const paramId = parseId(req.params.paramId);
  const input = parseBody(paramUpdateSchema, req.body);
  const param = await updateParam(id, paramId, input);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'property.param.update',
    entityType: 'property',
    entityId: String(id),
    meta: { paramId },
    req,
  });
  res.json({ data: param });
});

adminPropertiesRouter.delete('/:id/params/:paramId', async (req, res) => {
  const id = parseId(req.params.id);
  const paramId = parseId(req.params.paramId);
  await deleteParam(id, paramId);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'property.param.delete',
    entityType: 'property',
    entityId: String(id),
    meta: { paramId },
    req,
  });
  res.json({ data: { ok: true } });
});
