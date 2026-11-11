"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function FormatMenu({ label, children, disabled, primary, items, onSelect }: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  primary?: boolean;
  items: { value: string; label: string; detail?: string; selected?: boolean }[];
  onSelect: (value: string) => void;
}) {
  return <Menu.Root>
    <Menu.Trigger className={primary ? "primary" : undefined} disabled={disabled} aria-label={label}>
      {children}<ChevronDown size={14} aria-hidden />
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Content className="popup grid gap-1 p-1.5" align="end" sideOffset={7}>
        {items.map((item) => <Menu.Item key={item.value} className="popup-item flex items-center justify-between gap-5"
          onSelect={() => onSelect(item.value)} textValue={item.label}>
          <span>{item.label}{item.selected && <span aria-label=" selected"> ✓</span>}</span>
          {item.detail && <span className="file-type">.{item.detail}</span>}
        </Menu.Item>)}
      </Menu.Content>
    </Menu.Portal>
  </Menu.Root>;
}
