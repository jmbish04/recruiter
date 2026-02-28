export class Logger {
  constructor(private env: any, private name: string) {}
  info(msg: string, meta?: any) { console.log(`[INFO] [${this.name}] ${msg}`, meta || ''); }
  warn(msg: string, meta?: any) { console.warn(`[WARN] [${this.name}] ${msg}`, meta || ''); }
  error(msg: string, meta?: any) { console.error(`[ERROR] [${this.name}] ${msg}`, meta || ''); }
  debug(msg: string, meta?: any) { console.debug(`[DEBUG] [${this.name}] ${msg}`, meta || ''); }
  flush() {}
}
