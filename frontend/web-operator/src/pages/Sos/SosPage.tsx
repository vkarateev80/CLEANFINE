import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { EmptyState } from '../../components/ui/Feedback';

/** Заглушка этапа 1: экран реализуется на следующем этапе. */
export function SosPage() {
  return (
    <FullscreenLayout title="SosPage" backTo="/today" showSos={false}>
      <EmptyState title="Раздел в разработке" hint="Появится на следующем этапе." />
    </FullscreenLayout>
  );
}
