import { User, LogOut, Package, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderAccountMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userPrimaryLabel: string;
  userCompactLabel: string;
  userSecondaryLabel: string;
  onSignOut: () => Promise<void>;
}

export default function HeaderAccountMenu({
  open,
  onOpenChange,
  userPrimaryLabel,
  userCompactLabel,
  userSecondaryLabel,
  onSignOut,
}: HeaderAccountMenuProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto rounded-full px-0 py-0 text-left hover:bg-transparent"
        >
          <div className="flex items-center gap-3 rounded-full px-1 py-1 transition-colors hover:bg-black/[0.035]">
            <div className="max-w-[126px] text-right leading-tight">
              <div
                className="truncate text-[15px] font-semibold tracking-[0.01em]"
                title={userPrimaryLabel}
              >
                {userCompactLabel}
              </div>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.08)]">
              <User className="h-5 w-5" />
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[292px] rounded-[24px] border border-black/8 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.14)]"
      >
        <DropdownMenuLabel className="rounded-[18px] bg-stone-50 px-3 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white">
              <User className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold leading-none">
                {userPrimaryLabel}
              </div>
              <div className="truncate pt-1.5 text-sm font-medium normal-case text-muted-foreground">
                {userSecondaryLabel}
              </div>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-2 my-2 bg-black/8" />
        <DropdownMenuItem
          className="rounded-[16px] px-3 py-3 text-[15px] font-medium"
          onSelect={() => navigate("/profile?tab=settings")}
        >
          <Settings2 className="mr-3 h-4 w-4" />
          Профиль
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-[16px] px-3 py-3 text-[15px] font-medium"
          onSelect={() => navigate("/profile")}
        >
          <Package className="mr-3 h-4 w-4" />
          Заказы
        </DropdownMenuItem>
        <DropdownMenuSeparator className="mx-2 my-2 bg-black/8" />
        <DropdownMenuItem
          className="rounded-[16px] px-3 py-3 text-[15px] font-medium text-red-600 focus:bg-red-50 focus:text-red-600"
          onSelect={async (event) => {
            event.preventDefault();
            onOpenChange(false);
            await onSignOut();
          }}
        >
          <LogOut className="mr-3 h-4 w-4" />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
