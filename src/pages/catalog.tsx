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
  catalogImageUrl?: string;
  sizes: DictionaryOption[];
  category?: string;
  categories?: string[];
  collection?: string;
  collections?: string[];
  material?: string;
  materials?: string[];
  color?: string;
  colors?: string[];
  isNew?: boolean;
  isPopular?: boolean;
  likesCount?: number;
}

interface DictionaryOption {
  value: string;
  label: string;
  color?: string | null;
  showColorInCatalog?: boolean;
}

type CatalogFilterGroupKey = 'categories' | 'sizes' | 'materials' | 'colors' | 'collections';

type CatalogFilterOrder = Record<CatalogFilterGroupKey, number>;

const DEFAULT_CATALOG_FILTER_ORDER: CatalogFilterOrder = {
  categories: 10,
  sizes: 20,
  materials: 30,
  colors: 40,
  collections: 50,
};

interface FilterContentProps {
  sortOptions: { value: string; label: string }[];
  sortBy: string;
  onSortChange: (value: string) => void;
  filterGroupOrder: CatalogFilterOrder;
  showCategoryFilter: boolean;
  categories: DictionaryOption[];
  selectedCategories: string[];
  onToggleCategory: (value: string) => void;
  onClearCategories: () => void;
  showSizeFilter: boolean;
  sizes: DictionaryOption[];
  selectedSizes: string[];
  onToggleSize: (value: string) => void;
  onClearSizes: () => void;
  showMaterialFilter: boolean;
  materials: DictionaryOption[];
  selectedMaterials: string[];
  onToggleMaterial: (value: string) => void;
  onClearMaterials: () => void;
  showColorFilter: boolean;
  colors: DictionaryOption[];
  selectedColors: string[];
  onToggleColor: (value: string) => void;
  onClearColors: () => void;
  showCollectionFilter: boolean;
  collections: DictionaryOption[];
  selectedCollections: string[];
  onToggleCollection: (value: string) => void;
  onClearCollections: () => void;
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
  filterGroupOrder,
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
  showMaterialFilter,
  materials,
  selectedMaterials,
  onToggleMaterial,
  onClearMaterials,
  showColorFilter,
  colors,
  selectedColors,
  onToggleColor,
  onClearColors,
  showCollectionFilter,
  collections,
  selectedCollections,
  onToggleCollection,
  onClearCollections,
  minPriceInput,
  maxPriceInput,
  onMinPriceInputChange,
  onMaxPriceInputChange,
  onApplyPrice,
  onResetFilters,
}: FilterContentProps) {
  const filterSections = [
    {
      key: 'categories' as const,
      title: 'КАТЕГОРИИ',
      visible: showCategoryFilter,
      sortOrder: filterGroupOrder.categories,
      items: categories.map((item) => ({
        value: item.value,
        label: item.label,
        color: item.showColorInCatalog ? item.color ?? null : null,
      })),
      selectedValues: selectedCategories,
      onToggle: onToggleCategory,
      onClear: onClearCategories,
    },
    {
      key: 'sizes' as const,
      title: 'РАЗМЕРЫ',
      visible: showSizeFilter,
      sortOrder: filterGroupOrder.sizes,
      items: sizes.map((size) => ({
        value: size.value,
        label: size.label,
        color: size.showColorInCatalog ? size.color ?? null : null,
      })),
      selectedValues: selectedSizes,
      onToggle: onToggleSize,
      onClear: onClearSizes,
    },
    {
      key: 'materials' as const,
      title: 'МАТЕРИАЛЫ',
      visible: showMaterialFilter,
      sortOrder: filterGroupOrder.materials,
      items: materials.map((item) => ({
        value: item.value,
        label: item.label,
        color: item.showColorInCatalog ? item.color ?? null : null,
      })),
      selectedValues: selectedMaterials,
      onToggle: onToggleMaterial,
      onClear: onClearMaterials,
    },
    {
      key: 'colors' as const,
      title: 'ЦВЕТА',
      visible: showColorFilter,
      sortOrder: filterGroupOrder.colors,
      items: colors.map((item) => ({
        value: item.value,
        label: item.label,
        color: item.showColorInCatalog ? item.color ?? null : null,
      })),
      selectedValues: selectedColors,
      onToggle: onToggleColor,
      onClear: onClearColors,
    },
    {
      key: 'collections' as const,
      title: 'КОЛЛЕКЦИИ',
      visible: showCollectionFilter,
      sortOrder: filterGroupOrder.collections,
      items: collections.map((item) => ({
        value: item.value,
        label: item.label,
        color: item.showColorInCatalog ? item.color ?? null : null,
      })),
      selectedValues: selectedCollections,
      onToggle: onToggleCollection,
      onClear: onClearCollections,
    },
  ]
    .filter((section) => section.visible && section.items.length > 0)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.title.localeCompare(right.title, 'ru', { sensitivity: 'base' });
    });

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

      {filterSections.map((section) => (
        <div key={section.key}>
          <h3 className="text-lg font-bold mb-4 uppercase">{section.title}</h3>
          <div className="flex flex-col gap-2">
            <Button
              variant="ghost"
              className="justify-start uppercase font-bold tracking-widest"
              onClick={section.onClear}
            >
              ВЫБРАТЬ ВСЁ
            </Button>
            {section.items.map((item) => (
              <div key={`${section.key}-${item.value}`} className="flex items-center space-x-2">
                <Checkbox
                  id={`${section.key}-${item.value}`}
                  checked={section.selectedValues.includes(item.value)}
                  onCheckedChange={() => section.onToggle(item.value)}
                />
                <Label htmlFor={`${section.key}-${item.value}`} className="flex cursor-pointer items-center gap-2 font-medium">
                  {item.color && (
                    <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: item.color }} />
                  )}
                  <span>{item.label}</span>
                </Label>
              </div>
            ))}
          </div>
        </div>
      ))}

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
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [minPriceInput, setMinPriceInput] = useState("0");
  const [maxPriceInput, setMaxPriceInput] = useState("999999");
  const [categories, setCategories] = useState<DictionaryOption[]>([]);
  const [sizes, setSizes] = useState<DictionaryOption[]>([]);
  const [materials, setMaterials] = useState<DictionaryOption[]>([]);
  const [colors, setColors] = useState<DictionaryOption[]>([]);
  const [collections, setCollections] = useState<DictionaryOption[]>([]);
  const [showCategoryFilter, setShowCategoryFilter] = useState(true);
  const [showSizeFilter, setShowSizeFilter] = useState(true);
  const [showMaterialFilter, setShowMaterialFilter] = useState(true);
  const [showColorFilter, setShowColorFilter] = useState(true);
  const [showCollectionFilter, setShowCollectionFilter] = useState(true);
  const [filterGroupOrder, setFilterGroupOrder] = useState<CatalogFilterOrder>(DEFAULT_CATALOG_FILTER_ORDER);

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
              .map((item: any) => ({
                value: item.value,
                label: item.label,
                color: item.color ?? null,
                showColorInCatalog: item.showColorInCatalog !== false,
              }))
          : [];
        const nextSizes = Array.isArray(response?.sizes)
          ? response.sizes
              .filter((item: any) => item?.value && item?.label)
              .map((item: any) => ({
                value: item.value,
                label: item.label,
                color: item.color ?? null,
                showColorInCatalog: item.showColorInCatalog !== false,
              }))
          : [];
        const nextMaterials = Array.isArray(response?.materials)
          ? response.materials
              .filter((item: any) => item?.value && item?.label)
              .map((item: any) => ({
                value: item.value,
                label: item.label,
                color: item.color ?? null,
                showColorInCatalog: item.showColorInCatalog !== false,
              }))
          : [];
        const nextColors = Array.isArray(response?.colors)
          ? response.colors
              .filter((item: any) => item?.value && item?.label)
              .map((item: any) => ({
                value: item.value,
                label: item.label,
                color: item.color ?? null,
                showColorInCatalog: item.showColorInCatalog !== false,
              }))
          : [];
        const nextCollections = Array.isArray(response?.collections)
          ? response.collections
              .filter((item: any) => item?.value && item?.label)
              .map((item: any) => ({
                value: item.value,
                label: item.label,
                color: item.color ?? null,
                showColorInCatalog: item.showColorInCatalog !== false,
              }))
          : [];

        setCategories(nextCategories);
        setSizes(nextSizes);
        setMaterials(nextMaterials);
        setColors(nextColors);
        setCollections(nextCollections);
        setShowCategoryFilter(response?.visibility?.categories !== false);
        setShowSizeFilter(response?.visibility?.sizes !== false);
        setShowMaterialFilter(response?.visibility?.materials !== false);
        setShowColorFilter(response?.visibility?.colors !== false);
        setShowCollectionFilter(response?.visibility?.collections !== false);
        setFilterGroupOrder({
          categories: Number.isFinite(Number(response?.order?.categories)) ? Number(response.order.categories) : DEFAULT_CATALOG_FILTER_ORDER.categories,
          sizes: Number.isFinite(Number(response?.order?.sizes)) ? Number(response.order.sizes) : DEFAULT_CATALOG_FILTER_ORDER.sizes,
          materials: Number.isFinite(Number(response?.order?.materials)) ? Number(response.order.materials) : DEFAULT_CATALOG_FILTER_ORDER.materials,
          colors: Number.isFinite(Number(response?.order?.colors)) ? Number(response.order.colors) : DEFAULT_CATALOG_FILTER_ORDER.colors,
          collections: Number.isFinite(Number(response?.order?.collections)) ? Number(response.order.collections) : DEFAULT_CATALOG_FILTER_ORDER.collections,
        });
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

    const available = new Set(sizes.map((item) => item.value));
    setSelectedSizes((prev) => prev.filter((value) => available.has(value)));
  }, [sizes, showSizeFilter]);

  useEffect(() => {
    if (!showMaterialFilter) {
      setSelectedMaterials([]);
      return;
    }

    const available = new Set(materials.map((item) => item.value));
    setSelectedMaterials((prev) => prev.filter((value) => available.has(value)));
  }, [materials, showMaterialFilter]);

  useEffect(() => {
    if (!showColorFilter) {
      setSelectedColors([]);
      return;
    }

    const available = new Set(colors.map((item) => item.value));
    setSelectedColors((prev) => prev.filter((value) => available.has(value)));
  }, [colors, showColorFilter]);

  useEffect(() => {
    if (!showCollectionFilter) {
      setSelectedCollections([]);
      return;
    }

    const available = new Set(collections.map((item) => item.value));
    setSelectedCollections((prev) => prev.filter((value) => available.has(value)));
  }, [collections, showCollectionFilter]);

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
  }, [priceRange, selectedCategories, selectedSizes, selectedMaterials, selectedColors, selectedCollections]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      applyPriceInputs();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [minPriceInput, maxPriceInput]);

  const matchesDictionaryOption = (productValues: string[], selectedValues: string[], options: DictionaryOption[]) => {
    if (productValues.length === 0)
      return false;

    const normalizedProductValues = productValues
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => !!value);

    if (normalizedProductValues.length === 0) {
      return false;
    }

    return selectedValues.some((selectedValue) => {
      const normalizedSelectedValue = selectedValue.trim().toLowerCase();
      if (normalizedProductValues.includes(normalizedSelectedValue)) {
        return true;
      }

      const option = options.find((item) => item.value === selectedValue);
      const normalizedLabel = option?.label?.trim().toLowerCase();
      return !!normalizedLabel && normalizedProductValues.includes(normalizedLabel);
    });
  };

  const applyFilters = (items: Product[]) => {
    let result = [...items];

    // Price Filter
    result = result.filter(p => p.price >= priceRange.min && p.price <= priceRange.max);

    if (selectedCategories.length > 0) {
      result = result.filter((product) => {
        const productCategories = Array.isArray(product.categories) && product.categories.length > 0
          ? product.categories
          : (product.category ? [product.category] : []);
        return matchesDictionaryOption(productCategories, selectedCategories, categories);
      });
    }

    if (selectedSizes.length > 0) {
      result = result.filter(p => (p.sizes || []).some(size => selectedSizes.includes(size)));
    }

    if (selectedMaterials.length > 0) {
      result = result.filter((product) => {
        const productMaterials = Array.isArray(product.materials) && product.materials.length > 0
          ? product.materials
          : (product.material ? [product.material] : []);
        return matchesDictionaryOption(productMaterials, selectedMaterials, materials);
      });
    }

    if (selectedColors.length > 0) {
      result = result.filter((product) => {
        const productColors = Array.isArray(product.colors) && product.colors.length > 0
          ? product.colors
          : (product.color ? [product.color] : []);
        return matchesDictionaryOption(productColors, selectedColors, colors);
      });
    }

    if (selectedCollections.length > 0) {
      result = result.filter((product) => {
        const productCollections = Array.isArray(product.collections) && product.collections.length > 0
          ? product.collections
          : (product.collection ? [product.collection] : []);
        return matchesDictionaryOption(productCollections, selectedCollections, collections);
      });
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

  const toggleMaterial = (material: string) => {
    setSelectedMaterials((prev) =>
      prev.includes(material) ? prev.filter((value) => value !== material) : [...prev, material]
    );
  };

  const toggleColor = (color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((value) => value !== color) : [...prev, color]
    );
  };

  const toggleCollection = (collection: string) => {
    setSelectedCollections((prev) =>
      prev.includes(collection) ? prev.filter((value) => value !== collection) : [...prev, collection]
    );
  };

  const resetFilters = () => {
    setSortBy('popular');
    setSelectedCategories([]);
    setSelectedSizes([]);
    setSelectedMaterials([]);
    setSelectedColors([]);
    setSelectedCollections([]);
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
                  filterGroupOrder={filterGroupOrder}
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
                  showMaterialFilter={showMaterialFilter}
                  materials={materials}
                  selectedMaterials={selectedMaterials}
                  onToggleMaterial={toggleMaterial}
                  onClearMaterials={() => setSelectedMaterials([])}
                  showColorFilter={showColorFilter}
                  colors={colors}
                  selectedColors={selectedColors}
                  onToggleColor={toggleColor}
                  onClearColors={() => setSelectedColors([])}
                  showCollectionFilter={showCollectionFilter}
                  collections={collections}
                  selectedCollections={selectedCollections}
                  onToggleCollection={toggleCollection}
                  onClearCollections={() => setSelectedCollections([])}
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
                filterGroupOrder={filterGroupOrder}
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
                showMaterialFilter={showMaterialFilter}
                materials={materials}
                selectedMaterials={selectedMaterials}
                onToggleMaterial={toggleMaterial}
                onClearMaterials={() => setSelectedMaterials([])}
                showColorFilter={showColorFilter}
                colors={colors}
                selectedColors={selectedColors}
                onToggleColor={toggleColor}
                onClearColors={() => setSelectedColors([])}
                showCollectionFilter={showCollectionFilter}
                collections={collections}
                selectedCollections={selectedCollections}
                onToggleCollection={toggleCollection}
                onClearCollections={() => setSelectedCollections([])}
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
                    setSelectedMaterials([]);
                    setSelectedColors([]);
                    setSelectedCollections([]);
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
