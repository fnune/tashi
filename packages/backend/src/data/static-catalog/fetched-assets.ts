import type { ReadAsset } from "./static-food-catalog.js";

export interface AssetFetcher {
  fetch(request: Request | string): Promise<Response>;
}

export function fetchedAssets(assets: AssetFetcher, prefix: string): ReadAsset {
  return async (path) => {
    const response = await assets.fetch(
      `https://assets.local${prefix}/${path}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Catalog file ${path} answered ${response.status}`);
    }
    return response.json();
  };
}
