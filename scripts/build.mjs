// "Compilar" aqui significa: no hay dependencias que instalar ni paso de
// transpilacion (JS nativo), pero si validamos sintacticamente cada archivo
// fuente con `node --check` para detectar errores antes de commitear.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function collectJsFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectJsFiles(full, files);
    } else if (entry.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const files = collectJsFiles('src');
let failed = false;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`ok   ${file}`);
  } catch (err) {
    failed = true;
    console.error(`fail ${file}`);
    console.error(err.stderr?.toString() ?? err.message);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`\n${files.length} archivos verificados.`);
