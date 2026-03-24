import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAddressSuggestions } from "@/hooks/useAddressSuggestions";

export default function AddressAutocompleteInput({
  value,
  onValueChange,
  onSuggestionSelect,
  containerClassName,
  inputClassName,
  suggestionsClassName,
  minQueryLength = 4,
  suggestionsCount = 5,
  loadingMessage = "Ищем адрес...",
  autoComplete = "street-address",
  onFocus,
  onBlur,
  onChange,
  ...inputProps
}) {
  const listboxId = useId();
  const blurTimeoutRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const { suggestions, loading, clearSuggestions, ignoreNextLookup } = useAddressSuggestions(value, {
    enabled: !inputProps.disabled,
    minQueryLength,
    count: suggestionsCount,
  });

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const showSuggestions = isOpen && (loading || suggestions.length > 0);

  const handleInputChange = (event) => {
    setIsOpen(true);
    onValueChange?.(event.target.value, event);
    onChange?.(event);
  };

  const handleFocus = (event) => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
    }

    setIsOpen(true);
    onFocus?.(event);
  };

  const handleBlur = (event) => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 120);
    onBlur?.(event);
  };

  const handleSuggestionSelect = (suggestion) => {
    ignoreNextLookup(suggestion.value);
    clearSuggestions();
    setIsOpen(false);
    onValueChange?.(suggestion.value);
    onSuggestionSelect?.(suggestion);
  };

  return (
    <div className={cn("relative", containerClassName)}>
      <Input
        {...inputProps}
        value={value}
        autoComplete={autoComplete}
        aria-autocomplete="list"
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-expanded={showSuggestions}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={inputClassName}
      />

      {showSuggestions && (
        <div
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-auto border border-gray-200 bg-white shadow-lg",
            suggestionsClassName
          )}
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              {loadingMessage}
            </div>
          ) : (
            suggestions.map((suggestion) => (
              <button
                key={suggestion.value}
                type="button"
                role="option"
                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSuggestionSelect(suggestion);
                }}
              >
                {suggestion.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
