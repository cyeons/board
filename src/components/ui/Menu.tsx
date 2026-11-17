import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useWide } from "../../lib/device";
import { Modal } from "./Modal";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

/**
 * 메뉴. 컴퓨터에서는 버튼 아래 팝오버, 휴대폰에서는 아래에서 올라오는 시트로 연다.
 * 두 경우 모두 항목은 menuitem 역할이다.
 */
export function Menu({ items, label, triggerClassName, children }: { items: MenuItem[]; label: string; triggerClassName: string; children: ReactNode }) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  // 시트가 다 닫힌 뒤에 고른 일을 한다. 그래야 그 일이 여는 다른 창과 겹치지 않는다.
  const chosen = useRef<(() => void) | null>(null);

  if (wide) {
    return (
      <Dropdown.Root>
        <Dropdown.Trigger className={triggerClassName} aria-label={label} onClick={(e) => e.stopPropagation()}>
          {children}
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            className="menu-pop z-[60] min-w-44 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-[18px] bg-surface p-1.5 shadow-raised"
          >
            {items.map((item) => (
              <Dropdown.Item
                key={item.label}
                onSelect={item.onSelect}
                className={`flex min-h-11 cursor-pointer items-center rounded-xl px-3 font-medium outline-none data-[highlighted]:bg-fill ${item.danger ? "text-danger" : ""}`}
              >
                {item.label}
              </Dropdown.Item>
            ))}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    );
  }

  return (
    <>
      <button
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </button>
      <Modal
        bare
        open={open}
        onOpenChange={setOpen}
        title={label}
        onExitComplete={() => {
          chosen.current?.();
          chosen.current = null;
        }}
      >
        <div role="menu" aria-label={label} className="flex flex-col">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`press flex min-h-14 items-center rounded-control px-4 text-left text-md font-medium active:bg-fill ${item.danger ? "text-danger" : ""}`}
              onClick={() => {
                chosen.current = item.onSelect;
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
          <button className="btn btn-quiet mt-2" onClick={() => setOpen(false)}>
            닫기
          </button>
        </div>
      </Modal>
    </>
  );
}

/** 점 세 개 메뉴 */
export function DotsMenu({ items, label = "메뉴 열기" }: { items: MenuItem[]; label?: string }) {
  return (
    <Menu items={items} label={label} triggerClassName="icon-btn">
      <MoreHorizontal size={20} strokeWidth={2} />
    </Menu>
  );
}
