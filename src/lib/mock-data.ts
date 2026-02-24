
export interface Product {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  images: string[];
  sizes: string[];
  category: string;
  isNew: boolean;
  isPopular: boolean;
  likesCount: number;
  _creationTime: number;
}

export const PRODUCTS: Product[] = [
  {
    _id: "1",
    name: "OVERSIZED DEMON HOODIE",
    slug: "oversized-demon-hoodie",
    description: "Премиальный хлопок, оверсайз крой. Принт, который говорит сам за себя.",
    price: 8900,
    images: ["https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80"],
    sizes: ["S", "M", "L", "XL"],
    category: "hoodies",
    isNew: true,
    isPopular: true,
    likesCount: 150,
    _creationTime: Date.now()
  },
  {
    _id: "2",
    name: "STREETWEAR CARGO PANTS",
    slug: "streetwear-cargo-pants",
    description: "Функциональные карманы, прочный материал. Идеально для города.",
    price: 7500,
    images: ["https://images.unsplash.com/photo-1552160793-eb289119136f?auto=format&fit=crop&w=800&q=80"],
    sizes: ["S", "M", "L", "XL"],
    category: "pants",
    isNew: true,
    isPopular: false,
    likesCount: 89,
    _creationTime: Date.now() - 100000
  },
  {
    _id: "3",
    name: "ACID WASH T-SHIRT",
    slug: "acid-wash-t-shirt",
    description: "Винтажный эффект, свободный крой. База для любого аутфита.",
    price: 3500,
    images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80"],
    sizes: ["S", "M", "L", "XL"],
    category: "t-shirts",
    isNew: false,
    isPopular: true,
    likesCount: 240,
    _creationTime: Date.now() - 200000
  },
  {
    _id: "4",
    name: "URBAN BOMBER JACKET",
    slug: "urban-bomber-jacket",
    description: "Классический бомбер в современной интерпретации.",
    price: 12900,
    images: ["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=800&q=80"],
    sizes: ["M", "L", "XL"],
    category: "jackets",
    isNew: false,
    isPopular: true,
    likesCount: 310,
    _creationTime: Date.now() - 500000
  }
];

export const CATEGORIES = [
  { name: "Hoodies", slug: "hoodies" },
  { name: "Pants", slug: "pants" },
  { name: "T-Shirts", slug: "t-shirts" },
  { name: "Jackets", slug: "jackets" }
];
