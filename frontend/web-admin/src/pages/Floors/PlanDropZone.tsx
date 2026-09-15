import { useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { PLAN_ACCEPT, PLAN_FORMATS_HINT, planFileError } from './floorPlanUtils';

interface PlanDropZoneProps {
  onFile: (file: File) => void;
  /** Сообщение о неверном файле (=`null` — файл принят); форма показывает его у себя. */
  onInvalid?: (message: string | null) => void;
  disabled?: boolean;
  hint?: string;
  /**
   * `data-testid` для input[type=file]. Необязательный: одновременно в DOM
   * бывает только одна зона загрузки, иначе тест нашёл бы два одинаковых id.
   */
  testId?: string;
}

/** Зона загрузки плана: drag-and-drop и выбор файла — одна логика на экран. */
export function PlanDropZone({
  onFile,
  onInvalid,
  disabled,
  hint = PLAN_FORMATS_HINT,
  testId,
}: PlanDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(file: File | undefined) {
    if (!file) return;
    const error = planFileError(file);
    if (error) {
      onInvalid?.(error);
      return;
    }
    onInvalid?.(null);
    onFile(file);
  }

  return (
    <div
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        accept(event.dataTransfer.files[0]);
      }}
      className={[
        'flex flex-col items-center gap-3 rounded-xl border border-dashed bg-white p-8 text-center',
        dragging ? 'border-primary-500 bg-primary-50' : 'border-neutral-300',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="text-sm font-medium text-neutral-700">Перетащите файл плана сюда</div>
      <div className="text-xs text-neutral-400">{hint}</div>
      <input
        ref={inputRef}
        type="file"
        accept={PLAN_ACCEPT}
        className="sr-only"
        data-testid={testId}
        disabled={disabled}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          // Сброс значения: иначе повторный выбор того же файла не вызовет change.
          event.target.value = '';
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Выбрать файл
      </Button>
    </div>
  );
}
