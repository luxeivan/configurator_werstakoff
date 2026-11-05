import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ulid } from 'ulid';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { files } from '../db/schema.js';
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MODEL_EXTENSIONS = new Set(['glb', 'gltf', 'stl']);

export async function ensureUploadDirs() {
  await fs.mkdir(path.join(env.uploadDir, 'tmp'), { recursive: true });
  await fs.mkdir(path.join(env.uploadDir, 'public'), { recursive: true });
  await fs.mkdir(path.join(env.uploadDir, 'private'), { recursive: true });
}

function extensionOf(name) {
  return path.extname(String(name || '')).toLowerCase().replace('.', '');
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function moveFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.copyFile(source, destination);
    await fs.unlink(source);
  }
}

export function filePublicUrl(file) {
  if (!file?.path) return null;
  const relative = file.path.replace(/^public\//, '');
  return `/media/public/${relative}`;
}

export function serializeFile(file) {
  if (!file) return null;
  return {
    id: file.id,
    publicId: file.publicId,
    url: file.isPublic ? filePublicUrl(file) : null,
    originalName: file.originalName,
    mime: file.mime,
    sizeBytes: file.sizeBytes,
    kind: file.kind,
  };
}

async function validateModel(tempPath, extension) {
  if (!MODEL_EXTENSIONS.has(extension)) {
    throw httpError(400, 'MODEL_FORMAT_INVALID', 'Допустимы только GLB, GLTF и STL');
  }
  if (extension === 'glb') {
    const handle = await fs.open(tempPath, 'r');
    try {
      const buffer = Buffer.alloc(4);
      await handle.read(buffer, 0, 4, 0);
      if (buffer.toString('ascii') !== 'glTF') {
        throw httpError(400, 'MODEL_FORMAT_INVALID', 'Файл не является корректным GLB');
      }
    } finally {
      await handle.close();
    }
  }
  if (extension === 'gltf') {
    const raw = await fs.readFile(tempPath, 'utf8');
    try {
      JSON.parse(raw);
    } catch {
      throw httpError(400, 'MODEL_FORMAT_INVALID', 'Файл не является корректным GLTF JSON');
    }
  }
}

async function validateImage(tempPath) {
  const type = await fileTypeFromFile(tempPath);
  if (!type || !IMAGE_MIME.has(type.mime)) {
    throw httpError(400, 'IMAGE_FORMAT_INVALID', 'Допустимы только JPEG, PNG и WebP');
  }
  return type;
}

export async function storeUploadedFile({
  tempPath,
  originalName,
  mimetype = '',
  kind,
  isPublic = true,
  createdBy = null,
  subdir = 'other',
}) {
  const extension = extensionOf(originalName);
  let finalPath;
  let mime = mimetype;
  let sizeBytes = 0;

  try {
    if (kind === 'model') {
      await validateModel(tempPath, extension);
      const safeSubdir = subdir.replace(/[^a-zA-Z0-9/_-]/g, '');
      finalPath = path.join(env.uploadDir, 'public', safeSubdir, `${ulid()}.${extension}`);
      await moveFile(tempPath, finalPath);
      mime = extension === 'stl' ? 'model/stl' : extension === 'glb' ? 'model/gltf-binary' : 'model/gltf+json';
    } else if (kind === 'product_image' || kind === 'order_image') {
      await validateImage(tempPath);
      mime = 'image/jpeg';
      const safeSubdir = subdir.replace(/[^a-zA-Z0-9/_-]/g, '');
      const visibility = kind === 'order_image' || !isPublic ? 'private' : 'public';
      finalPath = path.join(env.uploadDir, visibility, safeSubdir, `${ulid()}.jpg`);
      await fs.mkdir(path.dirname(finalPath), { recursive: true });
      await sharp(tempPath)
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90, mozjpeg: true })
        .toFile(finalPath);
      await fs.unlink(tempPath).catch(() => {});
    } else if (kind === 'pdf') {
      mime = 'application/pdf';
      const safeSubdir = subdir.replace(/[^a-zA-Z0-9/_-]/g, '');
      finalPath = path.join(env.uploadDir, 'private', safeSubdir, `${ulid()}.pdf`);
      await moveFile(tempPath, finalPath);
    } else {
      throw httpError(400, 'FILE_KIND_INVALID', 'Неподдерживаемый тип файла');
    }

    const stat = await fs.stat(finalPath);
    sizeBytes = stat.size;
    const relativePath = path.relative(env.uploadDir, finalPath).split(path.sep).join('/');
    const sha256 = await hashFile(finalPath);

    const [result] = await db.insert(files).values({
      publicId: ulid(),
      path: relativePath,
      originalName: String(originalName || '').slice(0, 255),
      mime,
      sizeBytes,
      sha256,
      kind,
      isPublic: isPublic ? 1 : 0,
      createdBy,
    });

    const rows = await db.select().from(files).where(eq(files.id, result.insertId)).limit(1);
    return rows[0] || null;
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

export async function storeFileFromPath({
  sourcePath,
  originalName,
  kind,
  isPublic = true,
  createdBy = null,
  subdir = 'other',
  extension,
}) {
  const tempPath = path.join(env.uploadDir, 'tmp', `${ulid()}.${extension || extensionOf(originalName)}`);
  await fs.mkdir(path.dirname(tempPath), { recursive: true });
  await fs.copyFile(sourcePath, tempPath);
  return storeUploadedFile({
    tempPath,
    originalName,
    kind,
    isPublic,
    createdBy,
    subdir,
  });
}
