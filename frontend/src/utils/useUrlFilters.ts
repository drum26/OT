import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Состояние фильтров в строке адреса (ссылки с панели показателей открывают отфильтрованные списки).
 * Ключи из arrayKeys хранятся через запятую.
 */
export function useUrlFilters<T extends Record<string, any>>(arrayKeys: string[] = []) {
  const [sp, setSp] = useSearchParams();
  const values = useMemo(() => {
    const o: Record<string, any> = {};
    sp.forEach((v, k) => { o[k] = arrayKeys.includes(k) ? v.split(',').filter(Boolean) : v; });
    return o as Partial<T>;
  }, [sp, arrayKeys.join(',')]);
  const set = (patch: Partial<T>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) next.delete(k);
      else next.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };
  return [values, set] as const;
}
