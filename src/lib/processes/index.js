export async function listProcesses() {
  switch (process.platform) {
    case 'linux': {
      const mod = await import('./linux.js');
      return mod.listProcesses();
    }
    case 'darwin': {
      const mod = await import('./darwin.js');
      return mod.listProcesses();
    }
    case 'win32': {
      const mod = await import('./win32.js');
      return mod.listProcesses();
    }
    default:
      throw new Error(`Plataforma no soportada: ${process.platform}`);
  }
}
