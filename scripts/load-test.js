const baseUrl = process.env.BASE_URL || 'http://localhost:3500';
const total = Number(process.env.LOAD_REQUESTS || 200);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 20);
const endpoints = ['/api/health', '/api/catalog/tree', '/api/catalog/products?limit=20'];
const durations = [];
let errors = 0;
let cursor = 0;

async function worker() {
  while (cursor < total) {
    const index = cursor;
    cursor += 1;
    const path = endpoints[index % endpoints.length];
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) errors += 1;
      await response.arrayBuffer();
    } catch {
      errors += 1;
    }
    durations.push(performance.now() - started);
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = performance.now() - started;
durations.sort((a, b) => a - b);
const percentile = (value) => durations[Math.min(durations.length - 1, Math.floor(durations.length * value))] || 0;
console.log(JSON.stringify({
  total,
  concurrency,
  errors,
  rps: Number((total / (elapsed / 1000)).toFixed(1)),
  p50Ms: Number(percentile(0.5).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
  maxMs: Number(durations[durations.length - 1].toFixed(1)),
}, null, 2));
if (errors > 0 || percentile(0.95) > 1500) process.exit(1);
