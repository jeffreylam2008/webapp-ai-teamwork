export interface CustomerPreviousItem {
  item_code: string;
  eng_name: string;
  chi_name: string;
  unit: string;
  price: number;
  discount: number;
  qty: number;
  last_trans_code: string;
  last_used_date: string | null;
}

export interface CustomerTipsProduct {
  item_code: string;
  eng_name: string;
  chi_name: string;
  unit: string;
  price: number;
}
