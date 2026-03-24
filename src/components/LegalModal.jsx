import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function LegalModal({ isOpen, onClose, title, content }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[900px] w-[calc(100%-2rem)] h-[85vh] grid grid-rows-[auto,1fr] min-h-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Текст документа {title}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 mt-4 border rounded-md overflow-y-auto">
          <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
