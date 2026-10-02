export type TxType = "in" | "out";

export type Category = { id: string; label: string; icon: string };

export const CATEGORIES_IN: Category[] = [
  { id: "gaji", label: "Gaji", icon: "briefcase-outline" },
  { id: "bonus", label: "Bonus", icon: "gift-outline" },
  { id: "usaha", label: "Usaha", icon: "storefront-outline" },
  { id: "setoran", label: "Setoran", icon: "save-outline" },
  { id: "lainnya-in", label: "Lainnya", icon: "ellipsis-horizontal-circle-outline" },
];

export const CATEGORIES_OUT: Category[] = [
  { id: "makan", label: "Makan", icon: "restaurant-outline" },
  { id: "belanja", label: "Belanja", icon: "cart-outline" },
  { id: "tagihan", label: "Tagihan", icon: "receipt-outline" },
  { id: "transport", label: "Transport", icon: "car-sport-outline" },
  { id: "rumah", label: "Rumah", icon: "home-outline" },
  { id: "kesehatan", label: "Kesehatan", icon: "medkit-outline" },
  { id: "hiburan", label: "Hiburan", icon: "game-controller-outline" },
  { id: "pendidikan", label: "Pendidikan", icon: "school-outline" },
  { id: "lainnya-out", label: "Lainnya", icon: "ellipsis-horizontal-circle-outline" },
];

const ALL = [...CATEGORIES_IN, ...CATEGORIES_OUT];

export function categoryOf(id: string): Category | undefined {
  return ALL.find((c) => c.id === id);
}
