import { Button } from '@/components/ui/button';

interface SizeSelectorProps {
  sizes: string[];
  selectedSize: string;
  onSelect: (size: string) => void;
  sizeStock?: Record<string, number>;
}

export default function SizeSelector({ sizes, selectedSize, onSelect, sizeStock = {} }: SizeSelectorProps) {
  const hasStockInfo = Object.keys(sizeStock).length > 0;
  return (
    <div className="flex flex-wrap gap-2">
      {sizes.map((size) => (
        (hasStockInfo && (sizeStock[size] ?? 0) <= 0) ? (
          <Button
            key={size}
            variant="outline"
            disabled
            className="min-w-[50px] font-bold uppercase bg-gray-200 text-gray-500 cursor-not-allowed"
          >
            {size}
          </Button>
        ) : (
        <Button
          key={size}
          variant={selectedSize === size ? "default" : "outline"}
          onClick={() => onSelect(size)}
          className={`min-w-[50px] font-bold uppercase ${
            selectedSize === size ? 'bg-black text-white hover:bg-black/90' : 'bg-white text-black hover:bg-gray-100'
          }`}
        >
          {size}
        </Button>
        )
      ))}
    </div>
  );
}
