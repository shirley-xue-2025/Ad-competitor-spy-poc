import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = await readFile(path.join(root, 'dashboard.html'), 'utf8');
const reportPath = path.join(root, 'output/final_report.json');
const report = await readFile(reportPath, 'utf8');

const injection = `<script>window.__REPORT__=${report};</script>\n`;
const indexHtml = dashboard.replace('<script src="https://cdn.tailwindcss.com"></script>', `<script src="https://cdn.tailwindcss.com"></script>\n  ${injection}`);

await writeFile(path.join(root, 'index.html'), indexHtml, 'utf8');
await copyFile(reportPath, path.join(root, 'final_report.json'));
console.log(`Wrote index.html + final_report.json (${report.length} bytes JSON)`);
