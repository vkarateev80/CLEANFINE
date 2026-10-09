import { EmptyState } from '../../components/ui/Feedback';
import { useHeaderTitle } from '../../hooks/useHeaderTitle';

/** Заглушка этапа 1. */
export function ChatsPage() {
  useHeaderTitle('Чаты');
  return <EmptyState title="Раздел в разработке" hint="Появится на следующем этапе." />;
}
