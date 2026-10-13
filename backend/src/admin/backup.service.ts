import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { badRequest, notFound } from '../common/errors';

/** Резервное копирование БД через pg_dump (формат custom). Восстановление выполняется скриптом scripts/restore.sh. */
@Injectable()
export class BackupService {
  private readonly logger = new Logger('Backup');
  constructor(private config: ConfigService) {}

  get dir() {
    return path.resolve(this.config.get('BACKUP_DIR') ?? './storage/backups');
  }

  async list() {
    await fs.mkdir(this.dir, { recursive: true });
    const files = (await fs.readdir(this.dir)).filter((f) => f.endsWith('.dump'));
    const out = await Promise.all(files.map(async (f) => {
      const st = await fs.stat(path.join(this.dir, f));
      return { name: f, size: st.size, createdAt: st.mtime };
    }));
    return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(): Promise<{ name: string; size: number }> {
    await fs.mkdir(this.dir, { recursive: true });
    const url = new URL(this.config.getOrThrow<string>('DATABASE_URL'));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `ot-${stamp}.dump`;
    const file = path.join(this.dir, name);
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const args = ['--format=custom', '--no-owner', '-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-f', file, url.pathname.slice(1)];
    await new Promise<void>((resolve, reject) => {
      const p = spawn('pg_dump', args, { env });
      let err = '';
      p.stderr.on('data', (d) => (err += d.toString()));
      p.on('error', (e) => reject(badRequest(`pg_dump недоступен: ${e.message}`)));
      p.on('close', (code) => (code === 0 ? resolve() : reject(badRequest(`Ошибка резервного копирования: ${err.slice(0, 500)}`))));
    });
    const st = await fs.stat(file);
    this.logger.log(`Создана резервная копия ${name}`);
    return { name, size: st.size };
  }

  resolveFile(name: string) {
    if (!/^ot-[\w-]+\.dump$/.test(name)) throw badRequest('Некорректное имя файла');
    const file = path.join(this.dir, name);
    return fs.access(file).then(() => file, () => { throw notFound('Файл резервной копии'); });
  }
}
