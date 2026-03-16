import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { FLOW } from '@/lib/api-mapping';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import LoadingSpinner from '@/components/LoadingSpinner';
import { SlidersHorizontal } from 'lucide-react';
import PageSeo from '@/components/PageSeo';

const CATALOG_KEYWORDS = [
  'каталог одежды',
  'fashiondemon каталог',
  'streetwear каталог',
  'худи',
  'футболки',
  'верхняя одежда',
  'аксессуары',
];

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  sizes: string[];
  category: string;
  isNew?: boolean;
  isPopular?: boolean;
  likesCount?: number;
}

interface FilterContentProps {
  sortOptions: { value: string; label: string }[];
  sortBy: string;
  onSortChange: (value: string) => void;
  showCategoryFilter: boolean;
  categories: { value: string; label: string }[];
  selectedCategories: string[];
  onToggleCategory: (value: string) => void;
  onClearCategories: () => void;
  showSizeFilter: boolean;
  sizes: string[];
  selectedSizes: string[];
  onToggleSize: (value: string) => void;
  onClearSizes: () => void;
  minPriceInput: string;
  maxPriceInput: string;
  onMinPriceInputChange: (value: string) => void;
  onMaxPriceInputChange: (value: string) => void;
  onApplyPrice: () => void;
  onResetFilters: () => void;
}

function FilterContent({
  sortOptions,
  sortBy,
  onSortChange,
  showCategoryFilter,
  categories,
  selectedCategories,
  onToggleCategory,
  onClearCategories,
  showSizeFilter,
  sizes,
  selectedSizes,
  onToggleSize,
  onClearSizes,
  minPriceInput,
  maxPriceInput,
  onMinPriceInputChange,
  onMaxPriceInputChange,
  onApplyPrice,
  onResetFilters,
}: FilterContentProps) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold uppercase">ФИЛЬТРЫ</h3>
        <Button variant="ghost" size="sm" className="text-xs font-bold uppercase" onClick={onResetFilters}>
          СБРОСИТЬ ФИЛЬТРЫ
        </Button>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-4 uppercase">СОРТИРОВКА</h3>
        <div className="flex flex-col gap-2">
          {sortOptions.map((option) => (
            <Button
              key={option.value}
              variant={sortBy === option.value ? "default" : "ghost"}
              className="justify-start uppercase font-bold tracking-widest"
              onClick={() => onSortChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {showCategoryFilter && (
      <div>
        <h3 className="text-lg font-bold mb-4 uppercase">КАТЕГОРИЯ</h3>
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            className="justify-start uppercase font-bold tracking-widest"
            onClick={onClearCategories}
          >
            ВЫБРАТЬ ВСЁ
          </Button>
          {categories.map((category) => (
            <div key={category.value} className="flex items-center space-x-2">
              <Checkbox
                id={`category-${category.value}`}
                checked={selectedCategories.includes(category.value)}
                onCheckedChange={() => onToggleCategory(category.value)}
              />
              <Label htmlFor={`category-${category.value}`} className="cursor-pointer font-medium">
                {category.label}
              </Label>
            </div>
          ))}
        </div>
      </div>
      )}

      {showSizeFilter && (
      <div>
        <h3 className="text-lg font-bold mb-4 uppercase">РАЗМЕРЫ</h3>
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            className="justify-start uppercase font-bold tracking-widest"
            onClick={onClearSizes}
          >
            ВЫБРАТЬ ВСЁ
          </Button>
          {sizes.map((size) => (
            <div key={size} className="flex items-center space-x-2">
              <Checkbox
                id={`size-${size}`}
                checked={selectedSizes.includes(size)}
                onCheckedChange={() => onToggleSize(size)}
              />
              <Label htmlFor={`size-${size}`} className="cursor-pointer font-medium">
                {size}
              </Label>
            </div>
          ))}
        </div>
      </div>
      )}

      <div>
        <h3 className="text-lg font-bold mb-4 uppercase">ЦЕНА</h3>
        <div className="flex gap-4 items-center">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={minPriceInput}
            onChange={(e) => onMinPriceInputChange(e.target.value)}
            onBlur={onApplyPrice}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onApplyPrice();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="999999"
            value={maxPriceInput}
            onChange={(e) => onMaxPriceInputChange(e.target.value)}
            onBlur={onApplyPrice}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onApplyPrice();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const SORT_STORAGE_KEY = 'catalog_sort_by';
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  // Filters state
  const [sortBy, setSortBy] = useState('popular');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 999999 });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [minPriceInput, setMinPriceInput] = useState("0");
  const [maxPriceInput, setMaxPriceInput] = useState("999999");
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [showCategoryFilter, setShowCategoryFilter] = useState(true);
  const [showSizeFilter, setShowSizeFilter] = useState(true);

  const sortOptions = [
    { value: 'popular', label: 'Популярные' },
    { value: 'new', label: 'Новинки' },
    { value: 'sale', label: 'По акции' },
    { value: 'price-asc', label: 'Дешевле' },
    { value: 'price-desc', label: 'Дороже' },
  ];

  useEffect(() => {
    // Check URL params for initial sort
    const params = new URLSearchParams(location.search);
    const sortParam = params.get('sort');
    const storedSort = localStorage.getItem(SORT_STORAGE_KEY);
    if (sortParam) {
      setSortBy(sortParam);
      return;
    }
    if (storedSort && sortOptions.some((option) => option.value === storedSort)) {
      setSortBy(storedSort);
    }
  }, [location.search]);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, sortBy);
  }, [sortBy]);

  useEffect(() => {
    const fetchCatalogFilters = async () => {
      try {
        const response = await FLOW.getCatalogFilters();
        const nextCategories = Array.isArray(response?.categories)
          ? response.categories
              .filter((item: any) => item?.value && item?.label)
              .map((item: any) => ({ value: item.value, label: item.label }))
          : [];
        const nextSizes = Array.isArray(response?.sizes)
          ? response.sizes.filter((value: any) => typeof value === 'string')
          : [];

        setCategories(nextCategories);
        setSizes(nextSizes);
        setShowCategoryFilter(response?.visibility?.categories !== false);
        setShowSizeFilter(response?.visibility?.sizes !== false);
      } catch (error) {
        console.error('Failed to fetch catalog filters:', error);
      }
    };

    fetchCatalogFilters();
  }, []);

  useEffect(() => {
    if (!showCategoryFilter) {
      setSelectedCategories([]);
      return;
    }

    const available = new Set(categories.map((item) => item.value));
    setSelectedCategories((prev) => prev.filter((value) => available.has(value)));
  }, [categories, showCategoryFilter]);

  useEffect(() => {
    if (!showSizeFilter) {
      setSelectedSizes([]);
      return;
    }

    const available = new Set(sizes);
    setSelectedSizes((prev) => prev.filter((value) => available.has(value)));
  }, [sizes, showSizeFilter]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await FLOW.catalogFilter({ input: { sortBy } });
        if (Array.isArray(res)) {
          setProducts(res);
          applyFilters(res);
        }
      } catch (error) {
        console.error("Failed to fetch catalog:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [sortBy]);

  useEffect(() => {
    applyFilters(products);
  }, [priceRange, selectedCategories, selectedSizes]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      applyPriceInputs();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [minPriceInput, maxPriceInput]);

  const applyFilters = (items: Product[]) => {
    let result = [...items];

    // Price Filter
    result = result.filter(p => p.price >= priceRange.min && p.price <= priceRange.max);

    if (selectedCategories.length > 0) {
      result = result.filter(p => selectedCategories.includes(p.category));
    }

    if (selectedSizes.length > 0) {
      result = result.filter(p => (p.sizes || []).some(size => selectedSizes.includes(size)));
    }

    setFilteredProducts(result);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const toggleSize = (size: string) => {
    setSelectedSizes(prev =>
      prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
    );
  };

  const resetFilters = () => {
    setSortBy('popular');
    setSelectedCategories([]);
    setSelectedSizes([]);
    setPriceRange({ min: 0, max: 999999 });
    setMinPriceInput("0");
    setMaxPriceInput("999999");
    localStorage.removeItem(SORT_STORAGE_KEY);
  };

  const applyPriceInputs = () => {
    const minValue = minPriceInput === "" ? 0 : Number(minPriceInput);
    const maxValue = maxPriceInput === "" ? 0 : Number(maxPriceInput);
    setPriceRange({ min: minValue, max: maxValue });
  };

  const handleMinPriceInputChange = (rawValue: string) => {
    const value = rawValue.replace(/\D/g, "");
    setMinPriceInput(value);
  };

  const handleMaxPriceInputChange = (rawValue: string) => {
    const value = rawValue.replace(/\D/g, "");
    setMaxPriceInput(value);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <PageSeo
        title="Каталог одежды"
        description="Каталог fashiondemon: верхняя одежда, худи, футболки, аксессуары и другие модели бренда."
        canonicalPath="/catalog"
        keywords={CATALOG_KEYWORDS}
        structuredData={({ canonicalUrl, title }) => ({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: title,
          url: canonicalUrl,
          description: "Каталог fashiondemon с коллекциями одежды и аксессуаров.",
          inLanguage: "ru-RU",
        })}
      />
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 pt-28">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter">КАТАЛОГ</h1>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="md:hidden flex gap-2 items-center">
                <SlidersHorizontal className="w-4 h-4" /> ФИЛЬТРЫ
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px]">
              <div className="mt-8">
                <FilterContent
                  sortOptions={sortOptions}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  showCategoryFilter={showCategoryFilter}
                  categories={categories}
                  selectedCategories={selectedCategories}
                  onToggleCategory={toggleCategory}
                  onClearCategories={() => setSelectedCategories([])}
                  showSizeFilter={showSizeFilter}
                  sizes={sizes}
                  selectedSizes={selectedSizes}
                  onToggleSize={toggleSize}
                  onClearSizes={() => setSelectedSizes([])}
                  minPriceInput={minPriceInput}
                  maxPriceInput={maxPriceInput}
                  onMinPriceInputChange={handleMinPriceInputChange}
                  onMaxPriceInputChange={handleMaxPriceInputChange}
                  onApplyPrice={applyPriceInputs}
                  onResetFilters={resetFilters}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden md:block w-64 flex-shrink-0">
            <div className="sticky top-24">
              <FilterContent
                sortOptions={sortOptions}
                sortBy={sortBy}
                onSortChange={setSortBy}
                showCategoryFilter={showCategoryFilter}
                categories={categories}
                selectedCategories={selectedCategories}
                onToggleCategory={toggleCategory}
                onClearCategories={() => setSelectedCategories([])}
                showSizeFilter={showSizeFilter}
                sizes={sizes}
                selectedSizes={selectedSizes}
                onToggleSize={toggleSize}
                onClearSizes={() => setSelectedSizes([])}
                minPriceInput={minPriceInput}
                maxPriceInput={maxPriceInput}
                onMinPriceInputChange={handleMinPriceInputChange}
                onMaxPriceInputChange={handleMaxPriceInputChange}
                onApplyPrice={applyPriceInputs}
                onResetFilters={resetFilters}
              />
            </div>
          </aside>

          {/* Product Grid */}
          <div className="flex-1">
            {loading ? (
              <LoadingSpinner className="min-h-[400px]" />
            ) : filteredProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard key={product._id} product={product} allowQuickAdd={false} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-gray-50">
                <h3 className="text-2xl font-bold mb-2">Товары не найдены</h3>
                <p className="text-muted-foreground">Попробуйте изменить фильтры.</p>
                <Button 
                  variant="link" 
                  onClick={() => {
                    setPriceRange({ min: 0, max: 999999 });
                    setSelectedSizes([]);
                    setSelectedCategories([]);
                    setMinPriceInput("0");
                    setMaxPriceInput("999999");
                  }}
                  className="mt-4"
                >
                  Сбросить фильтры
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
