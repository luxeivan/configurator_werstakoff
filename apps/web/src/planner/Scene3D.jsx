import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { findPlacementConflict, findPlacementContact, isWallFacingCamera, normalizeAngle, polygonBounds } from '@planner/shared';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { bakeRender, canvasToDataUrl, composeShadow, postProcessRender, renderShadowMask } from './renderEngine.js';

const MODEL_CACHE = new Map();
const MODEL_CACHE_LIMIT = 30;

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
  });
}

function hexColor(item) {
  const chosen = item.selectedOptions || [];
  for (const option of item.product?.options || []) {
    const selected = chosen.find((value) => Number(value.propertyId) === Number(option.propertyId));
    if (!selected) continue;
    const param = (option.values || []).find((value) => Number(value.paramId) === Number(selected.paramId));
    if (param?.hex) return param.hex;
  }
  return null;
}

function loadModelObject(url) {
  if (!url) return Promise.resolve(null);
  if (MODEL_CACHE.has(url)) return Promise.resolve(MODEL_CACHE.get(url).clone(true));
  return new Promise((resolve) => {
    const done = (object) => {
      if (!object) return resolve(null);
      MODEL_CACHE.set(url, object);
      if (MODEL_CACHE.size > MODEL_CACHE_LIMIT) MODEL_CACHE.delete(MODEL_CACHE.keys().next().value);
      resolve(object.clone(true));
    };
    if (url.endsWith('.stl')) {
      new STLLoader().load(url, (geometry) => {
        geometry.computeVertexNormals();
        done(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: '#9aa6b5',
          metalness: 0.5,
          roughness: 0.42,
          envMapIntensity: 1.1,
        })));
      }, undefined, () => resolve(null));
    } else {
      new GLTFLoader().load(url, (gltf) => done(gltf.scene), undefined, () => resolve(null));
    }
  });
}

function normalizeObject(object, product) {
  const wrapper = new THREE.Group();
  const transform = product.model?.transform || {};
  // STL из CAD обычно Z-up, glTF/GLB — Y-up. Иначе тележка ложится на бок.
  const format = String(product.model?.format || '').toLowerCase();
  const upAxis = transform.upAxis || (format === 'stl' ? 'z' : 'y');
  if (upAxis === 'z') object.rotation.x -= Math.PI / 2;
  else if (upAxis === 'x') object.rotation.z += Math.PI / 2;
  object.updateMatrixWorld(true);
  wrapper.add(object);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;

  const width = Number(product.widthCm) || 50;
  const depth = Number(product.depthCm) || 50;
  const height = Number(product.heightCm) || 50;
  const hasManualScale = transform.fitMode === 'manual' && Number(transform.scale?.[0]) > 0;
  const candidates = [
    size.x > 0 ? width / size.x : null,
    size.z > 0 ? depth / size.z : null,
    size.y > 0 ? height / size.y : null,
  ].filter((value) => value && Number.isFinite(value));
  const scale = hasManualScale
    ? Number(transform.scale[0])
    : candidates.length ? Math.min(...candidates) : 1;
  wrapper.scale.setScalar(scale);
  wrapper.userData.baseScale = scale;
  const rotation = Array.isArray(transform.rotationDeg) ? transform.rotationDeg : [0, 0, 0];
  wrapper.rotation.set(
    (Number(rotation[0]) || 0) * Math.PI / 180,
    (Number(rotation[1]) || 0) * Math.PI / 180,
    (Number(rotation[2]) || 0) * Math.PI / 180,
  );
  const offset = Array.isArray(transform.offsetCm) ? transform.offsetCm : [0, 0, 0];
  wrapper.position.set(Number(offset[0]) || 0, Number(offset[1]) || 0, Number(offset[2]) || 0);
  return wrapper;
}

function fallbackBox(product) {
  const geometry = new THREE.BoxGeometry(
    Number(product.widthCm) || 50,
    Number(product.heightCm) || 50,
    Number(product.depthCm) || 50,
  );
  const material = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.2, roughness: 0.7 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = (Number(product.heightCm) || 50) / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function applyItemAppearance(object, color) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const cloned = materials.map((material) => {
      if (!material) return material;
      const next = material.clone();
      // Модели могут помечать окрашиваемые поверхности через extras.tintable:
      // RAL-цвет не должен закрашивать дерево, столешницу и чёрные детали.
      const tintable = next.userData?.tintable !== false;
      if (color && tintable && next.color) next.color.set(color);
      // Металлический блеск усиливаем только у окрашиваемых поверхностей:
      // дерево, столешница и пластик должны сохранять свои параметры.
      if (tintable) {
        if (typeof next.metalness === 'number') next.metalness = Math.max(next.metalness, 0.35);
        if (typeof next.roughness === 'number') next.roughness = Math.min(next.roughness, 0.55);
      }
      if ('envMapIntensity' in next) next.envMapIntensity = 1.1;
      next.needsUpdate = true;
      return next;
    });
    child.material = cloned.length === 1 ? cloned[0] : cloned;
  });
}

function roomBounds(room) {
  const points = room?.polygon || [];
  if (!points.length) return new THREE.Box3(new THREE.Vector3(-200, 0, -200), new THREE.Vector3(200, 200, 200));
  const box = new THREE.Box3();
  for (const [x, z] of points) box.expandByPoint(new THREE.Vector3(x, 0, z));
  box.max.y = Number(room.ceilingHeightCm) || 270;
  return box;
}

function sceneBounds(room, items) {
  const box = roomBounds(room);
  for (const item of items) {
    const product = item.product || {};
    box.expandByPoint(
      new THREE.Vector3(
        item.x - Number(product.widthCm) / 2,
        Number(item.elevationCm) || 0,
        item.z - Number(product.depthCm) / 2,
      ),
    );
    box.expandByPoint(
      new THREE.Vector3(
        item.x + Number(product.widthCm) / 2,
        (Number(item.elevationCm) || 0) + Number(product.heightCm),
        item.z + Number(product.depthCm) / 2,
      ),
    );
  }
  return box;
}

function clampItemPosition(item, room, x, z, rotationDeg = item.rotationDeg) {
  const polygon = room?.polygon || [];
  if (polygon.length < 3) return { x, z };
  const bounds = polygonBounds(polygon);
  const angle = normalizeAngle(rotationDeg);
  const width = Number(item.product?.widthCm) || 0;
  const depth = Number(item.product?.depthCm) || 0;
  const axisAligned = Math.abs(angle % 180) < 0.001 || Math.abs((angle % 180) - 180) < 0.001;
  const halfW = (axisAligned ? width : depth) / 2;
  const halfD = (axisAligned ? depth : width) / 2;
  return {
    x: Math.min(Math.max(x, bounds.minX + halfW), bounds.maxX - halfW),
    z: Math.min(Math.max(z, bounds.minZ + halfD), bounds.maxZ - halfD),
  };
}

function findRotationContact(fromDeg, toDeg, item, items, polygon) {
  let delta = ((normalizeAngle(toDeg) - normalizeAngle(fromDeg) + 540) % 360) - 180;
  let free = 0;
  let blocked = 1;
  for (let index = 0; index < 14; index += 1) {
    const t = (free + blocked) / 2;
    const rotationDeg = normalizeAngle(fromDeg + delta * t);
    if (findPlacementConflict({ ...item, rotationDeg }, items, polygon)) blocked = t;
    else free = t;
  }
  return normalizeAngle(fromDeg + delta * free);
}

const Scene3D = forwardRef(function Scene3D({ room, items = [], selectedIds = [], onSelect, onTransformEnd, showWalls = true, className = '' }, ref) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const roomGroupRef = useRef(null);
  const furnitureGroupRef = useRef(null);
  const directionalRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onTransformEndRef = useRef(onTransformEnd);
  const itemsRef = useRef(items);
  const roomRef = useRef(room);
  const transformRef = useRef(null);
  const transformDragRef = useRef(null);
  const hemiRef = useRef(null);
  const renderLightsRef = useRef(null);
  const showWallsRef = useRef(showWalls);
  const [gizmoMode, setGizmoMode] = useState('translate');
  const [gizmoActive, setGizmoActive] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onTransformEndRef.current = onTransformEnd;
  }, [onTransformEnd]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    showWallsRef.current = showWalls;
  }, [showWalls]);
  const pendingRef = useRef(0);
  const waitersRef = useRef([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  function beginLoad() {
    pendingRef.current += 1;
  }

  function endLoad() {
    pendingRef.current = Math.max(0, pendingRef.current - 1);
    if (pendingRef.current === 0) {
      const waiters = waitersRef.current.splice(0);
      waiters.forEach((resolve) => resolve());
    }
  }

  function whenReady() {
    if (pendingRef.current === 0) return Promise.resolve();
    return new Promise((resolve) => waitersRef.current.push(resolve));
  }

  function updateWallVisibility() {
    const state = stateRef.current;
    const group = roomGroupRef.current;
    if (!state || !group || !showWallsRef.current) return;
    const camera = state.camera.position;
    group.traverse((child) => {
      if (!child.userData?.wall) return;
      const normal = child.userData.wallNormal;
      const center = child.userData.wallCenter;
      if (!normal || !center) return;
      // Стены, обращённые к камере (передние), не должны перекрывать сцену.
      child.visible = !isWallFacingCamera([camera.x, camera.z], center, normal);
    });
  }

  function render() {
    const state = stateRef.current;
    if (!state) return;
    state.controls.update();
    updateWallVisibility();
    state.renderer.render(state.scene, state.camera);
  }

  function fitCamera(preset = 'fit') {
    const state = stateRef.current;
    if (!state) return;
    const box = sceneBounds(room, items);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 50);
    const distance = (radius / Math.sin((state.camera.fov * Math.PI) / 360)) * 1.1;
    const target = center.clone();
    target.y = Math.max(center.y * 0.55, 40);

    if (preset === 'front') {
      state.camera.position.set(center.x, center.y + size.y * 0.25, box.max.z + distance);
    } else if (preset === 'profile') {
      state.camera.position.set(box.max.x + distance, center.y + size.y * 0.25, center.z);
    } else {
      state.camera.position.set(
        center.x + distance * 0.72,
        center.y + distance * 0.52,
        center.z + distance * 0.72,
      );
    }
    state.controls.target.copy(target);
    state.camera.lookAt(target);
    state.controls.update();
    render();
  }

  function cameraJson() {
    const state = stateRef.current;
    if (!state) return null;
    return {
      position: state.camera.position.toArray(),
      target: state.controls.target.toArray(),
      fov: state.camera.fov,
      up: state.camera.up.toArray(),
      orthographic: false,
    };
  }

  function setCameraJson(camera) {
    const state = stateRef.current;
    if (!state || !camera?.position || !camera?.target) return;
    state.camera.position.fromArray(camera.position);
    state.controls.target.fromArray(camera.target);
    if (camera.fov) state.camera.fov = camera.fov;
    state.camera.updateProjectionMatrix();
    state.camera.lookAt(state.controls.target);
    state.controls.update();
    render();
  }

  function chooseGizmoMode(mode) {
    const transform = transformRef.current;
    if (!transform) return;
    transform.setMode(mode);
    if (mode === 'rotate') {
      transform.showX = false;
      transform.showY = true;
      transform.showZ = false;
    } else {
      transform.showX = true;
      transform.showY = false;
      transform.showZ = true;
    }
    setGizmoMode(mode);
  }

  useImperativeHandle(ref, () => ({
    fitAll: () => fitCamera('fit'),
    setView: (preset) => fitCamera(preset),
    getCamera: cameraJson,
    setCamera: setCameraJson,
    async capture(kind = 'view3d_user') {
      await whenReady();
      const state = stateRef.current;
      if (!state) return null;
      const saved = cameraJson();
      if (kind !== 'view3d_user') fitCamera(kind === 'view3d_fit' ? 'fit' : kind);
      // Ждать кадров не нужно: камера применяется при ближайшем render().
      state.renderer.render(state.scene, state.camera);
      const dataUrl = state.renderer.domElement.toDataURL('image/jpeg', 0.9);
      if (kind !== 'view3d_user') setCameraJson(saved);
      return {
        dataUrl,
        width: state.renderer.domElement.width,
        height: state.renderer.domElement.height,
        camera: kind === 'view3d_user' ? saved : cameraJson(),
      };
    },
    async renderSnapshot(options = {}) {
      await whenReady();
      const state = stateRef.current;
      if (!state) return null;
      const {
        onProgress = null,
        passes = 6,
        bufferScale = 0.65,
        lightSoftness = 1,
        postIntensity = 1,
      } = options;
      const { scene, camera, renderer } = state;
      const directional = directionalRef.current;

      // Рендер-освещение: глобальный свет ярче, плюс заполняющий, контровой
      // (rim) и локальный тёплый акцент — всё временно, затем восстанавливаем.
      const hemi = hemiRef.current;
      const renderLights = renderLightsRef.current;
      const prevHemi = hemi?.intensity ?? null;
      const prevDirectional = directional?.intensity ?? null;
      const lightRestore = [];
      if (renderLights) {
        for (const [key, light] of Object.entries(renderLights)) lightRestore.push([key, light.intensity]);
        renderLights.fill.intensity = 0.28;
        renderLights.rim.intensity = 0.4;
        renderLights.point.intensity = 550;
        // Мягкий заполняющий свет: чем выше «мягкость теней», тем светлее тени.
        renderLights.softFill.intensity = Math.min(0.8, 0.4 * lightSoftness);
      }
      if (hemi) hemi.intensity = 1.2;
      if (directional) directional.intensity = 1.0;

      // Прячем UI-слои: рамку выбора и gizmo.
      const transform = transformRef.current;
      const attached = transform?.object || null;
      if (attached) transform.detach();
      const helpers = [];
      furnitureGroupRef.current?.traverse((child) => {
        if (child.userData?.selection) {
          helpers.push(child);
          child.visible = false;
        }
      });

      // Увеличиваем буфер: высокий DPR даёт суперсэмплинг без лесенки.
      const size = new THREE.Vector2();
      renderer.getSize(size);
      const prevRatio = renderer.getPixelRatio();
      let ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 2.25);
      const maxSide = 2880;
      if (Math.max(size.x, size.y) * ratio > maxSide) ratio = maxSide / Math.max(size.x, size.y);
      renderer.setPixelRatio(ratio);
      renderer.setSize(size.x, size.y, false);

      // Рендер: суперсэмплинговая выборка — мягкие полутени и чистый AA.
      const accumulated = await bakeRender({
        renderer,
        scene,
        camera,
        light: directional,
        target: state.controls.target,
        passes,
        bufferScale,
        lightSoftness,
        onProgress,
      });
      const frame = postProcessRender(accumulated, { intensity: postIntensity });

      // Теневая маска: гарантирует видимые мягкие тени от предметов на полу.
      const offRenderLights = [];
      if (renderLights) {
        for (const light of Object.values(renderLights)) offRenderLights.push(light);
      }
      if (hemi) offRenderLights.push(hemi);
      const mask = renderShadowMask({
        renderer,
        scene,
        camera,
        offLights: offRenderLights,
        keyLight: directional,
        keyIntensity: 6,
      });
      const framed = composeShadow(frame, mask, 0.42);
      const width = framed.width;
      const height = framed.height;
      const dataUrl = canvasToDataUrl(framed, 'image/jpeg', 0.95);

      renderer.setPixelRatio(prevRatio);
      renderer.setSize(size.x, size.y, false);
      helpers.forEach((child) => {
        child.visible = true;
      });
      if (attached) transform.attach(attached);

      // Восстанавливаем освещение и материалы.
      if (renderLights) {
        for (const [key, intensity] of lightRestore) {
          if (renderLights[key]) renderLights[key].intensity = intensity;
        }
      }
      if (hemi && prevHemi !== null) hemi.intensity = prevHemi;
      if (directional && prevDirectional !== null) directional.intensity = prevDirectional;

      renderer.render(scene, camera);
      return {
        dataUrl,
        width,
        height,
        camera: cameraJson(),
      };
    },
  }));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#bccbdc');
    scene.fog = new THREE.Fog('#bccbdc', 2400, 12000);
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 20000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    const environment = pmrem.fromScene(roomEnvironment, 0.04);
    roomEnvironment.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.5;

    const controls = new OrbitControls(camera, renderer.domElement);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart = null;
    const onPointerDown = (event) => {
      pointerStart = [event.clientX, event.clientY];
    };
    const onPointerUp = (event) => {
      if (!pointerStart) return;
      const moved = Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]);
      pointerStart = null;
      if (moved > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(furnitureGroupRef.current?.children || [], true);
      const hit = hits.find((entry) => {
        let node = entry.object;
        while (node && !node.userData?.itemId) node = node.parent;
        return Boolean(node?.userData?.itemId);
      });
      if (!hit) {
        if (!transform.dragging && transform.axis === null) onSelectRef.current?.(null);
        return;
      }
      let node = hit.object;
      while (node && !node.userData?.itemId) node = node.parent;
      if (node?.userData?.itemId) onSelectRef.current?.(node.userData.itemId, event.shiftKey);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.screenSpacePanning = true;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.72);
    transform.setSpace('world');
    transform.setTranslationSnap(5);
    transform.setRotationSnap(Math.PI / 12);
    transform.showY = false;
    transform.setMode('translate');
    const transformHelper = transform.getHelper();
    scene.add(transformHelper);
    transformRef.current = transform;

    const onTransformDragging = (event) => {
      const state = stateRef.current;
      if (state) state.controls.enabled = !event.value;
      if (event.value) {
        const object = transform.object;
        const item = object
          ? itemsRef.current.find((entry) => entry.id === object.userData.itemId)
          : null;
        if (!item) return;
        const conflict = findPlacementConflict(
          item,
          itemsRef.current,
          roomRef.current?.polygon || [],
        );
        transformDragRef.current = {
          before: itemsRef.current,
          blocked: Boolean(conflict),
          last: { x: item.x, z: item.z, rotationDeg: item.rotationDeg },
        };
        return;
      }
      const object = transform.object;
      const drag = transformDragRef.current;
      transformDragRef.current = null;
      if (!object || !drag) return;
      const item = itemsRef.current.find((entry) => entry.id === object.userData.itemId);
      if (!item) return;
      const rotationDeg = normalizeAngle(-THREE.MathUtils.radToDeg(object.rotation.y));
      const x = Math.round(object.position.x * 10) / 10;
      const z = Math.round(object.position.z * 10) / 10;
      const changed =
        Math.abs(x - item.x) > 0.01 ||
        Math.abs(z - item.z) > 0.01 ||
        Math.abs(normalizeAngle(rotationDeg - item.rotationDeg)) > 0.01;
      if (changed) onTransformEndRef.current?.(item.id, { x, z, rotationDeg }, drag.before);
    };

    const onTransformChange = () => {
      const object = transform.object;
      const drag = transformDragRef.current;
      if (!object || !drag) return;
      const item = itemsRef.current.find((entry) => entry.id === object.userData.itemId);
      if (!item) return;
      const rotationDeg = normalizeAngle(-THREE.MathUtils.radToDeg(object.rotation.y));
      const clamped = clampItemPosition(
        item,
        roomRef.current,
        object.position.x,
        object.position.z,
        rotationDeg,
      );
      const candidate = { ...item, x: clamped.x, z: clamped.z, rotationDeg };
      const conflict = findPlacementConflict(
        candidate,
        itemsRef.current,
        roomRef.current?.polygon || [],
      );
      if (conflict && !drag.blocked) {
        if (transform.mode === 'rotate') {
          const contactDeg = findRotationContact(
            drag.last.rotationDeg,
            rotationDeg,
            item,
            itemsRef.current,
            roomRef.current?.polygon || [],
          );
          object.rotation.y = -(contactDeg * Math.PI) / 180;
          drag.last = { x: drag.last.x, z: drag.last.z, rotationDeg: contactDeg };
        } else {
          const contact = findPlacementContact(
            { x: drag.last.x, z: drag.last.z },
            candidate,
            itemsRef.current,
            roomRef.current?.polygon || [],
          );
          object.position.x = contact.x;
          object.position.z = contact.z;
          drag.last = { x: contact.x, z: contact.z, rotationDeg };
        }
        return;
      }
      drag.blocked = Boolean(conflict);
      object.position.x = clamped.x;
      object.position.z = clamped.z;
      drag.last = { x: clamped.x, z: clamped.z, rotationDeg };
    };

    transform.addEventListener('dragging-changed', onTransformDragging);
    transform.addEventListener('objectChange', onTransformChange);

    // Рассеянный «небесный» свет: преобладает над солнцем (облачная погода).
    const ambient = new THREE.HemisphereLight(0xfff4e6, 0x69788a, 1.0);
    scene.add(ambient);
    hemiRef.current = ambient;
    const directional = new THREE.DirectionalLight(0xfff8ef, 1.0);
    directional.position.set(250, 500, 180);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directionalRef.current = directional;

    // Источники, включаемые только во время «рендера»: глобальный фон,
    // заполняющий свет (рассеивает тени), контровой/rim сзади и локальный
    // тёплый акцент с бликами на металле.
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.0);
    fill.position.set(-260, 240, -170);
    fill.castShadow = false;
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe6c0, 0.0);
    rim.position.set(60, 480, -340);
    rim.castShadow = false;
    scene.add(rim);
    const point = new THREE.PointLight(0xffcf9a, 0, 1200, 1.6);
    point.position.set(0, 140, 0);
    point.castShadow = false;
    scene.add(point);
    // Мягкий «заполняющий» свет спереди-слева, снизу: приподнимает тени
    // и делает их мягче; сила на время рендера зависит от «мягкости теней».
    const softFill = new THREE.DirectionalLight(0xf2faff, 0.0);
    softFill.position.set(-180, 220, 260);
    softFill.castShadow = false;
    scene.add(softFill);
    renderLightsRef.current = { fill, rim, point, softFill };
    // Теневая карта должна покрывать весь пол комнаты: дальняя граница и ортобокс
    // больше комнаты, иначе тени от предметов в дальней части сцены пропадают.
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 4000;
    directional.shadow.camera.left = -1600;
    directional.shadow.camera.right = 1600;
    directional.shadow.camera.top = 1600;
    directional.shadow.camera.bottom = -1600;
    // Убираем «рваные» тени (shadow acne) на поверхностях: небольшое смещение
    // по нормали и лёгкий отрицательный bias убирают пятна на стенах и мебели.
    directional.shadow.bias = -0.0002;
    directional.shadow.normalBias = 0.5;
    scene.add(directional);

    const roomGroup = new THREE.Group();
    const furnitureGroup = new THREE.Group();
    scene.add(roomGroup, furnitureGroup);
    roomGroupRef.current = roomGroup;
    furnitureGroupRef.current = furnitureGroup;

    stateRef.current = { scene, camera, renderer, controls };
    setReady(true);

    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    let frame;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!document.hidden) render();
    };
    animate();

    const onLost = (event) => {
      event.preventDefault();
      setError('WebGL-контекст потерян. Обновите страницу.');
    };
    renderer.domElement.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      transform.removeEventListener('dragging-changed', onTransformDragging);
      transform.removeEventListener('objectChange', onTransformChange);
      transform.detach();
      scene.remove(transformHelper);
      transform.dispose();
      transformRef.current = null;
      directionalRef.current = null;
      hemiRef.current = null;
      renderLightsRef.current = null;
      controls.dispose();
      scene.environment = null;
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      stateRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const group = roomGroupRef.current;
    const state = stateRef.current;
    if (!group || !state || !room) return;
    disposeObject(group);
    group.clear();
    const polygon = room.polygon || [];
    if (polygon.length < 3) return;
    const shape = new THREE.Shape();
    polygon.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    shape.closePath();
    const floorGeometry = new THREE.ShapeGeometry(shape);
    floorGeometry.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(
      floorGeometry,
      new THREE.MeshStandardMaterial({
        color: '#394047',
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        depthWrite: true,
      }),
    );
    floor.name = 'room-floor';
    floor.receiveShadow = true;
    floor.castShadow = false;
    group.add(floor);

    const height = Number(room.ceilingHeightCm) || 270;
    const wallMaterial = new THREE.MeshStandardMaterial({ color: '#b9c8da', roughness: 0.9, side: THREE.DoubleSide });
    for (let index = 0; index < polygon.length; index += 1) {
      const [x1, z1] = polygon[index];
      const [x2, z2] = polygon[(index + 1) % polygon.length];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.hypot(dx, dz);
      if (!length) continue;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, height, 4), wallMaterial);
      wall.position.set((x1 + x2) / 2, height / 2, (z1 + z2) / 2);
      wall.rotation.y = Math.atan2(-dz, dx);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.userData.wall = true;
      wall.userData.wallNormal = [dz / length, -dx / length];
      wall.userData.wallCenter = [(x1 + x2) / 2, (z1 + z2) / 2];
      group.add(wall);
    }
    // Большая непрозрачная плоскость вместо координатной сетки: уходит к горизонту.
    const groundSize = 30000;
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    groundGeometry.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(
      groundGeometry,
      new THREE.MeshStandardMaterial({
        color: '#9eac9b',
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        depthWrite: true,
      }),
    );
    const bounds = new THREE.Box3();
    for (const [x, z] of polygon) bounds.expandByPoint(new THREE.Vector3(x, 0, z));
    const groundCenter = bounds.getCenter(new THREE.Vector3());
    ground.position.set(groundCenter.x, -0.6, groundCenter.z);
    ground.name = 'ground-plane';
    ground.receiveShadow = true;
    group.add(ground);
    fitCamera('fit');
  }, [room]);

  useEffect(() => {
    roomGroupRef.current?.traverse((child) => {
      if (child.userData?.wall) child.visible = showWalls;
    });
  }, [showWalls, room]);

  useEffect(() => {
    const group = furnitureGroupRef.current;
    if (!group) return;
    group.clear();
    let cancelled = false;

    for (const item of items) {
      const wrapper = new THREE.Group();
      wrapper.position.set(Number(item.x) || 0, Number(item.elevationCm) || 0, Number(item.z) || 0);
      wrapper.rotation.y = -((Number(item.rotationDeg) || 0) * Math.PI) / 180;
      wrapper.userData.itemId = item.id;
      group.add(wrapper);

      const product = item.product || {};
      const modelUrl = product.model?.optimized?.url || product.model?.url;
      beginLoad();
      loadModelObject(modelUrl)
        .then((object) => {
          if (cancelled) return;
          if (object) {
            const normalized = normalizeObject(object, product);
            applyItemAppearance(normalized, hexColor(item));
            normalized.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            wrapper.add(normalized);
          } else {
            wrapper.add(fallbackBox(product));
          }
          if (selectedIds.includes(item.id)) {
            wrapper.updateWorldMatrix(true, true);
            const worldBox = new THREE.Box3().setFromObject(wrapper);
            const localBox = worldBox.applyMatrix4(
              new THREE.Matrix4().copy(wrapper.matrixWorld).invert(),
            );
            const helper = new THREE.Box3Helper(localBox, 0x1d4ed8);
            helper.userData.selection = true;
            helper.material.depthTest = false;
            helper.material.transparent = true;
            helper.material.opacity = 0.95;
            helper.renderOrder = 10;
            helper.raycast = () => {};
            wrapper.add(helper);
          }
        })
        .finally(() => endLoad());
    }

    return () => {
      cancelled = true;
    };
  }, [items, selectedIds]);

  useEffect(() => {
    const transform = transformRef.current;
    const group = furnitureGroupRef.current;
    if (!transform || !group) return;
    if (selectedIds.length !== 1) {
      transform.detach();
      setGizmoActive(false);
      return;
    }
    const item = items.find((entry) => entry.id === selectedIds[0]);
    const wrapper = group.children.find((child) => child.userData.itemId === selectedIds[0]);
    if (!item || !wrapper || item.locked) {
      transform.detach();
      setGizmoActive(false);
      return;
    }
    transform.attach(wrapper);
    chooseGizmoMode(gizmoMode);
    setGizmoActive(true);
  }, [items, selectedIds, gizmoMode]);

  return (
    <div className={`scene3d ${className}`} ref={mountRef}>
      {gizmoActive && (
        <div className="scene-gizmo-tools" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={gizmoMode === 'translate' ? 'active' : ''}
            onClick={() => chooseGizmoMode('translate')}
            aria-label="Перемещение"
            title="Перемещение по полу"
          >
            ✥ Перемещение
          </button>
          <button
            type="button"
            className={gizmoMode === 'rotate' ? 'active' : ''}
            onClick={() => chooseGizmoMode('rotate')}
            aria-label="Вращение"
            title="Поворот вокруг вертикальной оси"
          >
            ⟳ Вращение
          </button>
        </div>
      )}
      {!ready && <div className="scene-placeholder">Загрузка 3D…</div>}
      {error && <div className="scene-error">{error}</div>}
    </div>
  );
});

export default Scene3D;
;