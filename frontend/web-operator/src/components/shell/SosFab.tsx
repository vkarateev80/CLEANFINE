import { Link } from 'react-router-dom';

/** Постоянная кнопка SOS на shell-экранах (DoD М6: «SOS отправляется в один тап»). */
export function SosFab({ testId = 'op-sos-button' }: { testId?: string }) {
  return (
    <Link
      to="/sos"
      data-testid={testId}
      className="op-fab fixed right-4 z-30 flex min-h-[56px] items-center gap-2 rounded-full bg-danger-500 px-5 text-base font-semibold text-white shadow-xl hover:bg-danger-600 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-2"
      aria-label="Аварийная заявка SOS"
    >
      <span aria-hidden="true">🚨</span>
      SOS
    </Link>
  );
}
