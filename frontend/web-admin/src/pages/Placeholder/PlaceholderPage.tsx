/** Заглушка страницы до реализации в соответствующей фазе (ПЛАН.md). */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="break-words text-2xl font-semibold text-neutral-900 max-md:text-xl">
        {title}
      </h1>
      {/* Внутренний отступ: телефон `p-5`, планшет и desktop `p-10` (как было).
          На 360 px 40 px с каждой стороны оставляли тексту ~130 px — он рвался
          на пять коротких строк. */}
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-center text-sm text-neutral-400 md:p-10">
        <span className="break-words">
          Раздел «{title}» будет реализован в фазе {phase} (см. ПЛАН.md).
        </span>
      </div>
    </div>
  );
}
