import { Color, MeshStandardMaterial, Vector3 } from 'three';

/**
 * «Настоящий» рендер сцены без тяжёлого рэйтрейсинга (классический приём
 * progressive render): несколько проходов одного и того же кадра с микро-джиттером
 * камеры (антиалиасинг) и источника света (мягкие полутени) усредняются в один
 * кадр. Усреднение N выборок даёт:
 *   - по-настоящему мягкие рассеянные тени (тень = суперпозиция N источников);
 *   - чистый суперсэмплинговый антиалиасинг по рёбрам;
 *   - подавление шума (стабилизация мелких деталей).
 * Поверх — лёгкая кинопоставка: тон/насыщенность, свечение Orton, виньетка.
 * Работает на canvas-операциях + чтении пикселей (getImageData), что доступно
 * во всех целевых браузерах.
 *
 * Плюс отдельная «теневая маска» (renderShadowMask): только главный свет + белые
 * материалы, затем маска умножается на кадр (composeShadow) — тени от предметов
 * на полу гарантированно видны даже при мягком рассеянном освещении.
 */

/**
 * Прогрессивная накопительная выборка сцены.
 *
 * Внимание: рендерер на время проходов уменьшается в bufferScale раз, а после —
 * восстанавливается до исходного состояния; результат возвращается холстом
 * в размере исходного буфера (масштаб с imageSmoothingQuality high).
 * Между проходами ожидания не ставим: в фоновых/headless-вкладках rAF и
 * вложенные таймеры тормозятся до ~4 с за тик, а проходы стоят миллисекунды.
 *
 * @param {Object} args
 * @param {THREE.Renderer} args.renderer  WebGL-рендерер (буфер уже увеличен).
 * @param {THREE.Scene} args.scene
 * @param {THREE.Camera} args.camera
 * @param {THREE.DirectionalLight|null} args.light  основной источник (джиттер теней).
 * @param {THREE.Vector3|null} args.target  точка интереса камеры (для AA-джиттера).
 * @param {number} [args.passes=8]  число выборок (1 базовая + N-1 джиттеров).
 * @param {number} [args.bufferScale=0.65]  масштаб буфера на время проходов.
 * @param {number} [args.lightSoftness=1]  множитель мягкости полутеней.
 * @param {(fraction:number)=>void} [args.onProgress]
 * @return {Promise<HTMLCanvasElement>} усреднённый кадр в полном размере
 */
export async function bakeRender({
  renderer,
  scene,
  camera,
  light = null,
  target = null,
  passes = 8,
  bufferScale = 0.65,
  lightSoftness = 1,
  onProgress = null,
}) {
  const dom = renderer.domElement;
  const outWidth = dom.width;
  const outHeight = dom.height;
  const prevRatio = renderer.getPixelRatio();
  const cssWidth = outWidth / prevRatio;
  const cssHeight = outHeight / prevRatio;

  const width = Math.max(200, Math.round(outWidth * bufferScale));
  const height = Math.max(150, Math.round(outHeight * bufferScale));

  // Буфер проходов — меньше исходного, чтобы усреднение было быстрым.
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const count = Math.max(3, passes);

  // Накопители.
  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  const tmpCtx = tmp.getContext('2d');
  const accCtx = document.createElement('canvas').getContext('2d');
  accCtx.canvas.width = width;
  accCtx.canvas.height = height;
  const supportsReadback =
    typeof accCtx.getImageData === 'function' &&
    typeof accCtx.createImageData === 'function' &&
    typeof accCtx.putImageData === 'function';
  const sum = supportsReadback ? new Float32Array(width * height * 4) : null;

  // Сохраняем исходные состояния света и камеры.
  const originalLight = light ? light.position.toArray() : null;
  const lightDistance = originalLight ? Math.hypot(originalLight[0], originalLight[1], originalLight[2]) : 0;
  const lightJitter = originalLight ? Math.max(8, lightDistance * 0.045 * lightSoftness) : 0;
  const baseCamPos = camera.position.toArray();
  const baseCamQuat = camera.quaternion.clone();

  // Полпикселя в мировых единицах на плоскости цели — для AA-джиттера камеры.
  let subPx = 0;
  if (target) {
    const dist = camera.position.distanceTo(target);
    if (dist > 0 && height > 0) {
      const worldAtTarget = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
      subPx = (worldAtTarget / height) * 0.5;
    }
  }
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

  for (let pass = 0; pass < count; pass += 1) {
    // Джиттер света — мягкие полутени (0-й проход — базовая позиция).
    if (light && originalLight && pass > 0) {
      light.position.set(
        originalLight[0] + (Math.random() * 2 - 1) * lightJitter,
        originalLight[1] + (Math.random() * 2 - 1) * lightJitter * 1.2,
        originalLight[2] + (Math.random() * 2 - 1) * lightJitter,
      );
    }
    // Джиттер камеры — суперсэмплинговый антиалиасинг.
    if (target && subPx > 0 && pass > 0) {
      const dx = (Math.random() * 2 - 1) * subPx;
      const dy = (Math.random() * 2 - 1) * subPx;
      camera.position.set(
        baseCamPos[0] + right.x * dx + up.x * dy,
        baseCamPos[1] + right.y * dx + up.y * dy,
        baseCamPos[2] + right.z * dx + up.z * dy,
      );
      camera.lookAt(target);
    }

    renderer.render(scene, camera);

    // Возвращаем камеру сразу, чтобы живой рендер-цикл не «плыл».
    if (pass > 0) {
      camera.position.fromArray(baseCamPos);
      camera.quaternion.copy(baseCamQuat);
    }

    if (supportsReadback) {
      tmpCtx.drawImage(dom, 0, 0);
      const data = tmpCtx.getImageData(0, 0, width, height).data;
      for (let i = 0; i < sum.length; i += 1) sum[i] += data[i];
    } else {
      // Fallback без чтения пикселей: взвешенная «растущая» сумма.
      accCtx.globalCompositeOperation = 'src-over';
      accCtx.globalAlpha = 1 / count;
      accCtx.drawImage(dom, 0, 0);
      accCtx.globalAlpha = 1;
      accCtx.globalCompositeOperation = 'src-over';
    }

    if (typeof onProgress === 'function') onProgress((pass + 1) / count);
  }

  // Усредняем выборки и применяем лёгкий гамма-тон (глубина теней).
  if (supportsReadback) {
    const out = accCtx.createImageData(width, height);
    const data = out.data;
    for (let i = 0; i < data.length; i += 1) {
      const v = sum[i] / count;
      data[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(Math.pow(v / 255, 0.98) * 255);
    }
    accCtx.putImageData(out, 0, 0);
  }

  // Восстанавливаем буфер рендерера и положение света.
  renderer.setPixelRatio(prevRatio);
  renderer.setSize(cssWidth, cssHeight, false);
  if (light && originalLight) light.position.fromArray(originalLight);

  // Масштабируем результат в полный размер (мягкий апскейл с высоким сглаживанием).
  const full = document.createElement('canvas');
  full.width = outWidth;
  full.height = outHeight;
  const fullCtx = full.getContext('2d');
  fullCtx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in fullCtx) fullCtx.imageSmoothingQuality = 'high';
  fullCtx.drawImage(accCtx.canvas, 0, 0, outWidth, outHeight);

  return full;
}

/**
 * Лёгкая кинопоставка кадра: яркость/контраст/насыщенность, свечение Orton
 * (мягкий blur + soft-light) и виньетка.
 *
 * @param {HTMLCanvasElement} canvas  результат накопительной выборки
 * @param {Object} [options]
 * @param {number} [options.intensity=1]  общий множитель силы постобработки
 * @return {HTMLCanvasElement} тот же canvas после постобработки
 */
export function postProcessRender(canvas, { intensity = 1 } = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');

  // Тон: яркость/контраст/насыщенность.
  const tone = document.createElement('canvas');
  tone.width = w;
  tone.height = h;
  const toneCtx = tone.getContext('2d');
  toneCtx.filter = `brightness(${1 + 0.04 * intensity}) contrast(${1 + 0.08 * intensity}) saturate(${1 + 0.12 * intensity})`;
  toneCtx.drawImage(canvas, 0, 0);
  ctx.drawImage(tone, 0, 0);

  // Orton: мягкое гауссово-подобное свечение поверх кадра.
  const blur = document.createElement('canvas');
  blur.width = w;
  blur.height = h;
  const blurCtx = blur.getContext('2d');
  blurCtx.filter = `blur(${Math.max(10, Math.round(Math.min(w, h) / 170))}px)`;
  blurCtx.drawImage(out, 0, 0);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.3 * intensity;
  ctx.drawImage(blur, 0, 0);
  ctx.globalCompositeOperation = 'src-over';
  ctx.globalAlpha = 1;

  // Виньетка.
  const radius = Math.hypot(w, h) / 2;
  const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, radius);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${0.12 * intensity})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  return out;
}

/**
 * Теневая маска: рендерим сцену только под направленным светом с белыми
 * материалами (и без окружения/тумана) — незатенённые области белые, теневые
 * тёмные. Главный свет на время маски умышленно задирается (keyIntensity):
 * лит-зоны клипнутся в белый, а тени останутся чёрными. Маска умножается
 * на итоговый кадр в composeShadow, поэтому тени от предметов гарантированно
 * видны, даже когда штатное освещение мягкое и рассеянное.
 */
export function renderShadowMask({ renderer, scene, camera, offLights = [], keyLight = null, keyIntensity = 6 }) {
  const saved = offLights.map((light) => [light, light.intensity]);
  offLights.forEach((light) => {
    light.intensity = 0;
  });
  const savedKey = keyLight ? keyLight.intensity : null;
  if (keyLight) keyLight.intensity = keyIntensity;
  const savedOverride = scene.overrideMaterial;
  const savedEnvironment = scene.environment;
  const savedFog = scene.fog;
  const savedBackground = scene.background;
  // На время маски: белый фон и без «горизонта» — засвеченная даль не должна
  // попадать в маску (иначе затемняется весь фон кадра).
  scene.background = new Color(0xffffff);
  let ground = null;
  scene.traverse((child) => {
    if (child.name === 'ground-plane' && !ground) ground = child;
  });
  const groundVisible = ground ? ground.visible : null;
  if (ground) ground.visible = false;
  scene.overrideMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  scene.environment = null;
  scene.fog = null;
  renderer.render(scene, camera);
  scene.overrideMaterial = savedOverride;
  scene.environment = savedEnvironment;
  scene.fog = savedFog;
  scene.background = savedBackground;
  if (ground && groundVisible !== null) ground.visible = groundVisible;
  saved.forEach(([light, intensity]) => {
    light.intensity = intensity;
  });
  if (keyLight && savedKey !== null) keyLight.intensity = savedKey;

  const canvas = document.createElement('canvas');
  canvas.width = renderer.domElement.width;
  canvas.height = renderer.domElement.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(renderer.domElement, 0, 0);

  // Мягкие края: широкое размытие маски — «облачные» растушёванные тени.
  const soft = document.createElement('canvas');
  soft.width = canvas.width;
  soft.height = canvas.height;
  const softCtx = soft.getContext('2d');
  softCtx.filter = `blur(${Math.max(6, Math.round(Math.min(canvas.width, canvas.height) / 150))}px)`;
  softCtx.drawImage(canvas, 0, 0);
  return soft;
}

/**
 * Умножает теневую маску на кадр: глубокие тени темнеют сильнее, полутени — мягко.
 */
export function composeShadow(base, mask, alpha = 0.55) {
  const out = document.createElement('canvas');
  out.width = base.width;
  out.height = base.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  ctx.drawImage(mask, 0, 0, out.width, out.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'src-over';
  return out;
}

/**
 * Сериализация канваса в data-url с контролем типа и качества.
 */
export function canvasToDataUrl(canvas, type = 'image/jpeg', quality = 0.95) {
  return typeof canvas.toDataURL === 'function' ? canvas.toDataURL(type, quality) : '';
}
