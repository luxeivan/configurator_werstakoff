import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';

const tmpDir = path.join(env.uploadDir, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

function extensionOf(name) {
  return path.extname(String(name || '')).toLowerCase().replace('.', '');
}

function makeUpload(maxMb, allowedExtensions, label) {
  return multer({
    dest: tmpDir,
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter(_req, file, callback) {
      const extension = extensionOf(file.originalname);
      if (!allowedExtensions.includes(extension)) {
        return callback(
          httpError(400, 'FILE_FORMAT_INVALID', `Недопустимый формат ${label}: .${extension || '?'}`),
        );
      }
      callback(null, true);
    },
  });
}

export const imageUpload = makeUpload(env.maxImageMb, ['jpg', 'jpeg', 'png', 'webp'], 'изображения');
export const modelUpload = makeUpload(env.maxModelMb, ['glb', 'gltf', 'stl'], '3D-модели');
export const zipUpload = makeUpload(env.maxImportZipMb, ['zip'], 'архива');
export const orderImageUpload = makeUpload(env.maxImageMb, ['jpg', 'jpeg', 'png', 'webp'], 'изображения заказа');
