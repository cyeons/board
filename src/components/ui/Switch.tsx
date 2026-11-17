import * as RadixSwitch from "@radix-ui/react-switch";

export function Switch({ checked, onCheckedChange, label, showLabel }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; showLabel?: boolean }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {showLabel && <span className="text-sm font-medium">{label}</span>}
      <RadixSwitch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className="relative h-[30px] w-[50px] shrink-0 rounded-full bg-fill-strong transition-colors duration-(--duration-base) data-[state=checked]:bg-accent"
      >
        <RadixSwitch.Thumb className="block size-[26px] translate-x-0.5 rounded-full bg-white shadow-[0_2px_6px_rgba(23,41,59,0.25)] transition-transform duration-300 ease-[var(--ease-spring)] data-[state=checked]:translate-x-[22px]" />
      </RadixSwitch.Root>
    </label>
  );
}
