import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { EmptyState } from '../../components/ui/Feedback';

/** Заглушка этапа 1. */
export function ChatThreadPage() {
  return (
    <FullscreenLayout title="Чат" backTo="/chats">
      <EmptyState title="Раздел в разработке" hint="Появится на следующем этапе." />
    </FullscreenLayout>
  );
}
