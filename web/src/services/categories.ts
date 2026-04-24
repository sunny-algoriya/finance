import { api } from "./api";

export type Category = {
  id: number | string;
  name: string;
};

export type CategoryCreateInput = {
  name: string;
};

export type CategoryUpdateInput = Partial<CategoryCreateInput>;

function normalizeCategory(raw: any): Category {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  const name = raw?.name;
  if (id === undefined || id === null) throw new Error("Category missing id.");
  if (typeof name !== "string") throw new Error("Category missing name.");
  return { id, name };
}

function normalizeCategoryList(raw: any): Category[] {
  const items = Array.isArray(raw) ? raw : raw?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeCategory);
}

export type CategoryListParams = {
  search?: string;
};

export async function listCategories(
  params: CategoryListParams = {}
): Promise<Category[]> {
  const search = params.search?.trim();
  const res = await api.get("/category/?page_size=1000", {
    params: search ? { search } : undefined,
  });
  return normalizeCategoryList(res.data);
}

export async function createCategory(input: CategoryCreateInput): Promise<Category> {
  const res = await api.post("/category/", input);
  return normalizeCategory(res.data);
}

export async function patchCategory(
  id: Category["id"],
  input: CategoryUpdateInput
): Promise<Category> {
  const res = await api.patch(`/category/${id}/`, input);
  return normalizeCategory(res.data);
}

export async function putCategory(
  id: Category["id"],
  input: CategoryCreateInput
): Promise<Category> {
  const res = await api.put(`/category/${id}/`, input);
  return normalizeCategory(res.data);
}

export async function deleteCategory(id: Category["id"]): Promise<void> {
  await api.delete(`/category/${id}/`);
}

