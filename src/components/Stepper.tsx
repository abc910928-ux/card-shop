// 數量加減
export default function Stepper({
  value,
  max,
  onChange,
  size = "md",
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  size?: "md" | "sm";
}) {
  const btn = size === "sm" ? "px-2.5 py-1 text-base" : "px-3.5 py-2 text-lg";
  return (
    <div class="inline-flex items-center rounded-lg border border-line bg-surface">
      <button
        type="button"
        class={`${btn} leading-none disabled:opacity-30`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="減少"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.floor(Number((e.target as HTMLInputElement).value));
          onChange(Math.max(1, Math.min(max, Number.isFinite(n) ? n : 1)));
        }}
        class={`${size === "sm" ? "w-9" : "w-12"} appearance-none bg-transparent text-center text-sm outline-none [&::-webkit-inner-spin-button]:appearance-none`}
        aria-label="數量"
      />
      <button
        type="button"
        class={`${btn} leading-none disabled:opacity-30`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}
