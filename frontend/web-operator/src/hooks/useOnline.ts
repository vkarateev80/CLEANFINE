import { useNetStore } from '../stores/netStore';

export function useOnline(): boolean {
  return useNetStore((s) => s.online);
}
