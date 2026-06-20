import { useState, useEffect } from 'react';

interface Category {
  cate_code: string;
  desc: string;
}

interface CategoryOption {
  value: string;
  label: string;
}

const CATEGORIES_FETCH_LIMIT = 1000;

// Global cache for categories loaded from t_items_category via /api/categories
let categoriesCache: Category[] | null = null;
let categoriesPromise: Promise<Category[]> | null = null;

export function invalidateCategoriesCache() {
  categoriesCache = null;
  categoriesPromise = null;
}

async function loadCategories(): Promise<Category[]> {
  if (categoriesCache) {
    return categoriesCache;
  }

  if (!categoriesPromise) {
    categoriesPromise = fetch(`/api/categories?limit=${CATEGORIES_FETCH_LIMIT}`)
      .then((response) => response.json())
      .then((result) => {
        if (result.success) {
          const data = (result.data || []) as Category[];
          categoriesCache = data;
          return data;
        }
        throw new Error(result.error || 'Failed to fetch categories');
      })
      .catch((error) => {
        categoriesCache = null;
        throw error;
      })
      .finally(() => {
        categoriesPromise = null;
      });
  }

  return categoriesPromise;
}

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>(categoriesCache ?? []);
  const [loading, setLoading] = useState(!categoriesCache);

  useEffect(() => {
    let cancelled = false;

    const fetchCategories = async () => {
      if (categoriesCache) {
        setCategories(categoriesCache);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await loadCategories();
        if (!cancelled) {
          setCategories(data);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const options: CategoryOption[] = categories.map((category) => ({
    value: category.cate_code,
    label: category.desc,
  }));

  return { categories, options, loading };
};
