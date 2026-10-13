import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface UnitNode { id: string; parentId: string | null; name: string }

/** Кэш дерева подразделений для вычисления дочерних/родительских подразделений */
@Injectable()
export class UnitTreeService {
  private cache: { at: number; units: Map<string, UnitNode>; children: Map<string, string[]> } | null = null;
  private readonly ttlMs = 30_000;

  constructor(private prisma: PrismaService) {}

  invalidate() {
    this.cache = null;
  }

  private async load() {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache;
    const list = await this.prisma.organizationalUnit.findMany({ select: { id: true, parentId: true, name: true } });
    const units = new Map(list.map((u) => [u.id, u]));
    const children = new Map<string, string[]>();
    for (const u of list) {
      if (u.parentId) children.set(u.parentId, [...(children.get(u.parentId) ?? []), u.id]);
    }
    this.cache = { at: Date.now(), units, children };
    return this.cache;
  }

  /** Подразделения вместе со всеми дочерними */
  async withDescendants(ids: string[]): Promise<string[]> {
    const { children } = await this.load();
    const out = new Set<string>();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      stack.push(...(children.get(id) ?? []));
    }
    return [...out];
  }

  /** Цепочка: само подразделение и все родительские */
  async ancestorsMap(): Promise<Map<string, string[]>> {
    const { units } = await this.load();
    const res = new Map<string, string[]>();
    for (const id of units.keys()) {
      const chain: string[] = [];
      let cur: string | null = id;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        chain.push(cur);
        cur = units.get(cur)?.parentId ?? null;
      }
      res.set(id, chain);
    }
    return res;
  }

  async names(): Promise<Map<string, string>> {
    const { units } = await this.load();
    return new Map([...units.values()].map((u) => [u.id, u.name]));
  }

  /** Проверка, что назначение родителя не создаёт цикл */
  async wouldCreateCycle(unitId: string, newParentId: string | null): Promise<boolean> {
    if (!newParentId) return false;
    if (newParentId === unitId) return true;
    const desc = await this.withDescendants([unitId]);
    return desc.includes(newParentId);
  }
}
