import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface Unit { id: string; name: string; code: string | null; parentId: string | null; isActive: boolean; _count?: { employees: number } }
export interface Position { id: string; name: string; code: string | null; workCategory: string | null; isProfession: boolean; isActive: boolean }
export interface TypeRef { id: string; code: string; name: string; isActive: boolean; description?: string | null; isPeriodic?: boolean; requiresConfirmation?: boolean; sortOrder?: number }

const get = <T,>(url: string) => () => api.get<T>(url).then((r) => r.data);
const opts = { staleTime: 60_000 };

export const useUnits = () => useQuery({ queryKey: ['units'], queryFn: get<Unit[]>('/units'), ...opts });
export const usePositions = () => useQuery({ queryKey: ['positions'], queryFn: get<Position[]>('/positions'), ...opts });
export const useWorkCategories = () => useQuery({ queryKey: ['work-categories'], queryFn: get<string[]>('/work-categories'), ...opts });
export const useBriefingTypes = () => useQuery({ queryKey: ['briefing-types'], queryFn: get<TypeRef[]>('/briefing-types'), ...opts });
export const useCheckTypes = () => useQuery({ queryKey: ['check-types'], queryFn: get<TypeRef[]>('/check-types'), ...opts });
export const useDocuments = () => useQuery({ queryKey: ['safety-documents'], queryFn: get<any[]>('/safety-documents'), ...opts });
export const useCommissions = () => useQuery({ queryKey: ['commissions'], queryFn: get<any[]>('/commissions'), ...opts });
export const usePpeItems = (enabled = true) => useQuery({ queryKey: ['ppe-items'], queryFn: get<any[]>('/ppe/items'), enabled, ...opts });
export const useAssignees = (enabled = true) => useQuery({ queryKey: ['assignees'], queryFn: get<{ id: string; fullName: string }[]>('/tasks/assignees'), enabled, ...opts });

/** Построение дерева подразделений для TreeSelect */
export function unitTree(units: Unit[]) {
  const byParent = new Map<string | null, Unit[]>();
  for (const u of units) byParent.set(u.parentId, [...(byParent.get(u.parentId) ?? []), u]);
  const ids = new Set(units.map((u) => u.id));
  const build = (pid: string | null): any[] =>
    (byParent.get(pid) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((u) => ({
      title: u.isActive ? u.name : `${u.name} (архив)`, value: u.id, key: u.id, children: build(u.id),
    }));
  // корни: без родителя или с недоступным родителем
  const roots = units.filter((u) => !u.parentId || !ids.has(u.parentId));
  return roots.sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((u) => ({ title: u.isActive ? u.name : `${u.name} (архив)`, value: u.id, key: u.id, children: build(u.id) }));
}
