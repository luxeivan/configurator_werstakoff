import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_HISTORY = 50;

function snapshotProduct(product) {
  return {
    publicId: product.publicId,
    name: product.name,
    sku: product.sku,
    slug: product.slug,
    priceKopecks: product.priceKopecks,
    currency: product.currency,
    unit: product.unit,
    widthCm: product.widthCm,
    depthCm: product.depthCm,
    heightCm: product.heightCm,
    weightKg: product.weightKg,
    shortDescription: product.shortDescription,
    imageUrl: product.imageUrl,
    section: product.section,
    options: product.options || [],
    propertyValues: product.propertyValues || [],
    model: product.model || null,
  };
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function record(state, patch) {
  const past = [...state.past, { room: state.room, items: state.items }].slice(-MAX_HISTORY);
  return { ...patch, past, future: [] };
}

export const usePlannerStore = create(
  persist(
    (set) => ({
      room: null,
      items: [],
      selectedIds: [],
      past: [],
      future: [],

      setRoom: (room) =>
        set((state) => record(state, { room, selectedIds: [] })),

      clearProject: () => set({ room: null, items: [], selectedIds: [], past: [], future: [] }),

      addItem: (product, placement) =>
        set((state) => {
          const item = {
            id: makeId(),
            product: snapshotProduct(product),
            x: Number(placement.x) || 0,
            z: Number(placement.z) || 0,
            rotationDeg: Number(placement.rotationDeg) || 0,
            elevationCm: Number(placement.elevationCm) || 0,
            quantity: Number(placement.quantity) || 1,
            selectedOptions: placement.selectedOptions || [],
            locked: false,
          };
          return record(state, { items: [...state.items, item], selectedIds: [item.id] });
        }),

      updateItem: (id, patch, { recordHistory = true } = {}) =>
        set((state) => {
          const items = state.items.map((item) => (item.id === id ? { ...item, ...patch } : item));
          return recordHistory ? record(state, { items }) : { items };
        }),

      replaceItems: (items) => set({ items }),

      commitItems: (beforeItems) =>
        set((state) => ({
          past: [...state.past, { room: state.room, items: beforeItems }].slice(-MAX_HISTORY),
          future: [],
        })),

      select: (id, additive = false) =>
        set((state) => {
          if (!id) return { selectedIds: [] };
          if (!additive) return { selectedIds: [id] };
          return {
            selectedIds: state.selectedIds.includes(id)
              ? state.selectedIds.filter((item) => item !== id)
              : [...state.selectedIds, id],
          };
        }),

      selectMany: (ids) => set({ selectedIds: ids }),
      clearSelection: () => set({ selectedIds: [] }),

      removeSelected: () =>
        set((state) => {
          const ids = new Set(state.selectedIds);
          if (!ids.size) return state;
          return record(state, {
            items: state.items.filter((item) => !ids.has(item.id)),
            selectedIds: [],
          });
        }),

      duplicateSelected: () =>
        set((state) => {
          if (!state.selectedIds.length) return state;
          const selected = state.items.filter((item) => state.selectedIds.includes(item.id));
          const copies = selected.map((item) => ({
            ...item,
            id: makeId(),
            x: item.x + 15,
            z: item.z + 15,
            selectedOptions: [...item.selectedOptions],
          }));
          return record(state, {
            items: [...state.items, ...copies],
            selectedIds: copies.map((item) => item.id),
          });
        }),

      pasteItems: (sourceItems, offset = 15) =>
        set((state) => {
          if (!sourceItems?.length) return state;
          const copies = sourceItems.map((item) => ({
            ...item,
            id: makeId(),
            x: Number(item.x) + offset,
            z: Number(item.z) + offset,
            selectedOptions: [...(item.selectedOptions || [])],
          }));
          return record(state, {
            items: [...state.items, ...copies],
            selectedIds: copies.map((item) => item.id),
          });
        }),

      alignSelected: (mode = 'centerX') =>
        set((state) => {
          if (state.selectedIds.length < 2) return state;
          const ids = new Set(state.selectedIds);
          const selected = state.items.filter((item) => ids.has(item.id));
          if (mode === 'left') {
            const target = Math.min(...selected.map((item) => item.x - Number(item.product.widthCm) / 2));
            return record(state, {
              items: state.items.map((item) =>
                ids.has(item.id)
                  ? { ...item, x: target + Number(item.product.widthCm) / 2 }
                  : item,
              ),
            });
          }
          if (mode === 'centerX') {
            const target = selected.reduce((sum, item) => sum + item.x, 0) / selected.length;
            return record(state, {
              items: state.items.map((item) => (ids.has(item.id) ? { ...item, x: target } : item)),
            });
          }
          return state;
        }),

      pushSelectedToWall: () =>
        set((state) => {
          if (!state.selectedIds.length || !state.room?.polygon?.length) return state;
          const ids = new Set(state.selectedIds);
          const xs = state.room.polygon.map(([x]) => x);
          const zs = state.room.polygon.map(([, z]) => z);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minZ = Math.min(...zs);
          const maxZ = Math.max(...zs);
          return record(state, {
            items: state.items.map((item) => {
              if (!ids.has(item.id) || item.locked) return item;
              const halfW = Number(item.product.widthCm) / 2;
              const halfD = Number(item.product.depthCm) / 2;
              const distances = [
                { key: 'x', value: minX + halfW, distance: Math.abs(item.x - (minX + halfW)) },
                { key: 'x', value: maxX - halfW, distance: Math.abs(item.x - (maxX - halfW)) },
                { key: 'z', value: minZ + halfD, distance: Math.abs(item.z - (minZ + halfD)) },
                { key: 'z', value: maxZ - halfD, distance: Math.abs(item.z - (maxZ - halfD)) },
              ];
              distances.sort((a, b) => a.distance - b.distance);
              return { ...item, [distances[0].key]: distances[0].value };
            }),
          });
        }),

      rotateSelected: (deltaDeg) =>
        set((state) => {
          if (!state.selectedIds.length) return state;
          const ids = new Set(state.selectedIds);
          const items = state.items.map((item) =>
            ids.has(item.id) && !item.locked
              ? { ...item, rotationDeg: (Number(item.rotationDeg) + Number(deltaDeg) + 360) % 360 }
              : item,
          );
          return record(state, { items });
        }),

      setQuantity: (id, quantity) =>
        set((state) => {
          const value = Math.max(1, Math.min(99, Number(quantity) || 1));
          return record(state, {
            items: state.items.map((item) => (item.id === id ? { ...item, quantity: value } : item)),
          });
        }),

      setItemOptions: (id, selectedOptions) =>
        set((state) =>
          record(state, {
            items: state.items.map((item) =>
              item.id === id ? { ...item, selectedOptions } : item,
            ),
          }),
        ),

      toggleLock: (id) =>
        set((state) =>
          record(state, {
            items: state.items.map((item) =>
              item.id === id ? { ...item, locked: !item.locked } : item,
            ),
          }),
        ),

      undo: () =>
        set((state) => {
          const previous = state.past[state.past.length - 1];
          if (!previous) return state;
          return {
            room: previous.room,
            items: previous.items,
            past: state.past.slice(0, -1),
            future: [...state.future, { room: state.room, items: state.items }],
            selectedIds: [],
          };
        }),

      redo: () =>
        set((state) => {
          const next = state.future[state.future.length - 1];
          if (!next) return state;
          return {
            room: next.room,
            items: next.items,
            past: [...state.past, { room: state.room, items: state.items }],
            future: state.future.slice(0, -1),
            selectedIds: [],
          };
        }),
    }),
    {
      name: 'iron-planner-project',
      version: 1,
      migrate: (persisted, version) => {
        if (!persisted) return persisted;
        if (version < 1) return { ...persisted, items: persisted.items || [] };
        return persisted;
      },
      partialize: (state) => ({ room: state.room, items: state.items }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted || {}),
        selectedIds: [],
        past: [],
        future: [],
      }),
    },
  ),
);
