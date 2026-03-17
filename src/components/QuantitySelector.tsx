import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';

interface QuantitySelectorProps {
  quantity: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export default function QuantitySelector({ quantity, min = 1, max = 10, onChange, disabled = false }: QuantitySelectorProps) {
  const handleDecrement = () => {
    if (!disabled && quantity > min) onChange(quantity - 1);
  };

  const handleIncrement = () => {
    if (!disabled && quantity < max) onChange(quantity + 1);
  };

  return (
    <div className={`flex items-center rounded-md border ${disabled ? "opacity-80" : ""}`}>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleDecrement}
        disabled={disabled || quantity <= min}
        className="h-10 w-10"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <div className="w-12 text-center font-bold text-lg">{quantity}</div>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleIncrement}
        disabled={disabled || quantity >= max}
        className="h-10 w-10"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
