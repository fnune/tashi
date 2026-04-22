# USDA FoodData Central source data

CSV files extracted from USDA FoodData Central downloads.

- SR Legacy (2018-04): https://fdc.nal.usda.gov/download-datasets
- Foundation Foods (2025-12-18): https://fdc.nal.usda.gov/download-datasets
- Survey/FNDDS (2024-10-31): https://fdc.nal.usda.gov/download-datasets

Public domain (U.S. government work).

Rebuild the SQLite database:

```
pnpm --filter backend import-usda
```
