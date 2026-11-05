export function optionDelta(product, selectedOptions = []) {
  let delta = 0;
  const chosen = [];
  for (const option of product?.options || []) {
    const selected = selectedOptions.find((item) => Number(item.propertyId) === Number(option.propertyId));
    if (!selected) continue;
    const value = (option.values || []).find((item) => Number(item.paramId) === Number(selected.paramId));
    if (!value) continue;
    delta += Number(value.priceDeltaKopecks || 0);
    chosen.push({
      propertyId: option.propertyId,
      propertyName: option.propertyName,
      paramId: value.paramId,
      label: value.label,
      hex: value.hex,
      ral: value.ral,
      priceDeltaKopecks: Number(value.priceDeltaKopecks || 0),
    });
  }
  return { delta, chosen };
}

export function itemUnitPrice(product, selectedOptions = []) {
  return Number(product?.priceKopecks || 0) + optionDelta(product, selectedOptions).delta;
}

export function calculateTotals(items, { vatMode = 'included', vatRate = 20 } = {}) {
  const subtotal = (items || []).reduce(
    (sum, item) => sum + Number(item.unitPriceKopecks || 0) * Number(item.quantity || 1),
    0,
  );
  const rate = Number(vatRate) || 0;
  let vat = 0;
  let total = subtotal;
  if (vatMode === 'included' && rate > 0) {
    vat = Math.round((subtotal * rate) / (100 + rate));
  } else if (vatMode === 'added' && rate > 0) {
    vat = Math.round((subtotal * rate) / 100);
    total = subtotal + vat;
  }
  return {
    subtotalKopecks: subtotal,
    vatKopecks: vat,
    totalKopecks: total,
    vatMode,
    vatRate: rate,
  };
}
