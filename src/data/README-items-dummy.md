# Items dummy data

`items-dummy.json` contains sample product items that match the app **items** table (Products → Items).

## Schema mapping

Each object uses the same fields as the **POST /api/products** body:

| Field          | Required | Description                    |
|----------------|----------|--------------------------------|
| item_code      | Yes      | Unique code (e.g. BEA-001)     |
| eng_name       | Yes      | English name                   |
| chi_name       | Yes      | Chinese name                   |
| desc           | No       | Description                    |
| price          | No       | Unit price                     |
| price_special  | No       | Special/promotional price      |
| cate_code      | No       | Category code                 |
| unit           | No       | Unit (pcs, kg, bottle, etc.)   |

## Categories

The dummy data uses these category codes. Create them under **Administration → Settings → Product Categories** if they don’t exist:

- **BEAUTY** – Beauty
- **FRAG** – Fragrances
- **FURN** – Furniture
- **GROC** – Groceries
- **ELEC** – Electronics
- **OFFICE** – Office supplies

Alternatively, you can remove or clear `cate_code` in the JSON (or set to `null`) so items are created without a category.

## How to load the data

1. **Manually**: In the app, go to **Products → Items → Add**, and enter each item from the JSON (or use the table import if your app supports it).

2. **Via API**: With the app running and a valid auth token, you can POST each object to `/api/products`:

   ```bash
   # Example (replace TOKEN and BASE_URL)
   curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" \
     -d '{"item_code":"BEA-001","eng_name":"Essence Mascara Lash Princess","chi_name":"睫毛膏",...}' \
     http://localhost:8000/api/products
   ```

3. **Seed script**: You can add a small Node script that reads `items-dummy.json` and calls `POST /api/products` for each item (with your auth token and base URL).

## Source

The list is inspired by [DummyJSON Products](https://dummyjson.com/docs/products) and adjusted to fit this app’s `t_items` schema (item_code, eng_name, chi_name, desc, price, price_special, cate_code, unit).
