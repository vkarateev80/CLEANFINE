import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { EmptyState } from '../../components/ui/Feedback';

/** Заглушка этапа 1: экран реализуется на следующем этапе. */
export function RouteMapPage() {
  return (
    <FullscreenLayout title="RouteMapPage" backTo="/today" showSos={false}>
      <EmptyState title="Раздел в разработке" hint="Появится на следующем этапе." />
    </FullscreenLayout>
  );
}
