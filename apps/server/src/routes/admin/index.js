import { Router } from 'express';
import { loadAuthUser, requireAdmin } from '../../middleware/auth.js';
import { adminSettingsRouter } from './settings.js';
import { adminUsersRouter } from './users.js';
import { adminCatalogRouter } from './catalog.js';
import { adminImportRouter } from './import.js';
import { adminPropertiesRouter } from './properties.js';
import { adminOrdersRouter } from './orders.js';

export const adminRouter = Router();

adminRouter.use(loadAuthUser);
adminRouter.use('/orders', adminOrdersRouter);
adminRouter.use(requireAdmin);
adminRouter.use('/settings', adminSettingsRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/properties', adminPropertiesRouter);
adminRouter.use('/import', adminImportRouter);
adminRouter.use('/', adminCatalogRouter);
