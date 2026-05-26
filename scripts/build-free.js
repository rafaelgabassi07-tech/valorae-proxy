import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run(label, cmd, args) {
  console.log(`\n[build] ${label}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`[build] Falhou: ${label}`);
    process.exit(result.status || 1);
  }
}

function collectJsFiles() {
  const roots = ['api','routes','lib','scripts'];
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  }
  roots.forEach(walk);
  return files;
}

console.log('[build] Syntax check');
for (const file of collectJsFiles()) run(`node --check ${file}`, process.execPath, ['--check', file]);
console.log(`[build] Checked ${collectJsFiles().length} JS files`);

run('typecheck-free', process.execPath, ['scripts/typecheck-free.js']);
run('audit:functions', process.execPath, ['scripts/audit-functions.js']);
run('audit:free', process.execPath, ['scripts/preflight-free-only.js']);
run('audit:version', process.execPath, ['scripts/audit-version-consistency.js']);
run('audit:routes', process.execPath, ['scripts/audit-route-contract.js']);
run('audit:release', process.execPath, ['scripts/audit-release-readiness.js']);
run('audit:minutiae', process.execPath, ['scripts/audit-minutiae.js']);
run('audit:recommended', process.execPath, ['scripts/audit-recommended-improvements.js']);
run('audit:final', process.execPath, ['scripts/audit-final-maturity.js']);
console.log('\nBuild OK: contrato de lançamento validado sem dependências externas.');
