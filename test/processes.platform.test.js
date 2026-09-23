import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listProcesses as listWin32Processes } from '../src/lib/processes/win32.js';
import { listProcesses as listDarwinProcesses } from '../src/lib/processes/darwin.js';

// Estos tests ejecutan el listado REAL del SO (powershell.exe / ps), no un
// mock. Solo tienen sentido en su plataforma nativa, asi que se saltan en
// cualquier otra (aqui: siempre se saltan en la CI de Linux/macOS que corre
// el test de win32, y viceversa).

test(
  'win32 listProcesses(): encuentra el proceso propio con startedAtMs valido',
  { skip: process.platform !== 'win32' },
  () => {
    const list = listWin32Processes();
    const self = list.find((p) => p.pid === process.pid);
    assert.ok(self, `no se encontro el pid propio (${process.pid}) en el listado`);
    assert.equal(self.pid, process.pid);
    assert.notEqual(self.startedAtMs, null);
  },
);

test(
  'darwin listProcesses(): encuentra el proceso propio con startedAtMs valido',
  { skip: process.platform !== 'darwin' },
  () => {
    const list = listDarwinProcesses();
    const self = list.find((p) => p.pid === process.pid);
    assert.ok(self, `no se encontro el pid propio (${process.pid}) en el listado`);
    assert.equal(self.pid, process.pid);
    assert.notEqual(self.startedAtMs, null);
  },
);
