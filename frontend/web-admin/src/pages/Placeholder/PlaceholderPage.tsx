/** Заглушка страницы до реализации в соответствующей фазе (ПЛАН.md). */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
        Раздел «{title}» будет реализован в фазе {phase} (см. ПЛАН.md).
      </div>
    </div>
  );
}
