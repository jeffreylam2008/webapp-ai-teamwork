# Employee access and role relationships

This document describes how **t_employee**, **t_employee_access**, **t_employee_access_default**, and **t_employee_role** relate.

---

## 1. t_employee ↔ t_employee_access (via employee_code)

**Relationship:** `t_employee_access` stores **actual, saved permissions** per employee and shop. It references `t_employee` by **employee_code** (and **shop_code**).

| Table                | Key columns                    | Meaning |
|----------------------|--------------------------------|--------|
| **t_employee**       | uid, employee_code, default_shopcode, role_code, ... | One row per person (same employee_code can repeat per shop). |
| **t_employee_access**| employee_code, shop_code, `function`, a_create, a_edit, a_delete, a_view | One row per (employee, shop, function) = **current** access (what the user can do). |

- **Link:** `t_employee_access.employee_code` → `t_employee.employee_code`  
  (and `t_employee_access.shop_code` aligns with shop context; often `t_employee.default_shopcode` for that employee).
- **Cardinality:** One employee (per shop) can have many rows in `t_employee_access` (one per function).
- **Usage:** APIs read/write permissions by `(employee_code, shop_code)`; UI “Access control” edits this table.

So: **t_employee_access** = “what this employee at this shop is allowed to do” (by function), keyed by **employee_code** (and **shop_code**) that tie back to **t_employee**.

---

## 2. t_employee ↔ t_employee_role (via role_code)

**Relationship:** `t_employee` has a **role**; the role is identified by **role_code**. That code is intended to reference a role table (**t_employee_role**).

| Table             | Key columns   | Meaning |
|-------------------|---------------|--------|
| **t_employee**    | uid, employee_code, role_code, ... | Each employee has one role_code (e.g. 1 = Supervisor, 2 = User). |
| **t_employee_role** (optional) | role_code, role_name, ... | Master list of roles and their meaning. |

- **Link:** `t_employee.role_code` → `t_employee_role.role_code`.
- **Cardinality:** Many employees can share the same role_code.
- **Usage:** Role is **coarse-grained** (e.g. “Supervisor” vs “User”); used for display (e.g. “Supervisor” tag) and potentially for high-level checks. It does **not** by itself define per-function create/edit/delete/view; that is in **t_employee_access**.

So: **t_employee_role** = “what role this employee has” (classification); **t_employee** holds **role_code** that points at that role.

---

## 3. t_employee_access_default (role_code) vs t_employee_role

**t_employee_access_default** stores **default permissions per role per function**. It references **t_employee_role** by **role_code** (no employee_code or shop_code).

| Table                        | Key columns                    | Purpose |
|-----------------------------|--------------------------------|--------|
| **t_employee_access_default** | role_code, `function`, a_create, a_edit, a_delete, a_view | **Default permissions per role per function.** One row per (role_code, function) with create/edit/delete/view flags. Used to pre-fill or reset **t_employee_access** when applying role defaults. |
| **t_employee_role**         | role_code, (e.g. role_name)    | **Role definition** (e.g. Supervisor, User). |

- **t_employee_access_default**  
  - Keyed by **role_code + function** (references **t_employee_role** by role_code).  
  - One row per (role_code, function) with a_create, a_edit, a_delete, a_view.  
  - Answers: “What is the **default** access for this **role** per function?”  
  - Used when initialising or resetting **t_employee_access** for an employee (by copying defaults for that employee’s role_code).

- **t_employee_role**  
  - Keyed by **role_code**.  
  - Defines role names and (optionally) other role metadata.

**How they work together:**

- When creating or resetting an employee’s access, the app looks up the employee’s **role_code** in **t_employee**, then copies rows from **t_employee_access_default** for that role_code into **t_employee_access** (per employee_code, shop_code).

So:

- **t_employee_access** = actual permissions per (employee_code, shop_code), referenced from **t_employee**.
- **t_employee_role** = role definition (referenced by **role_code** from **t_employee**).
- **t_employee_access_default** = default permissions per **(role_code, function)**; references **t_employee_role**; used to feed or reset **t_employee_access** by role.

---

## Summary diagram

```
t_employee_role (role_code, role_name, ...)
       ↑
       │ role_code
       │
t_employee_access_default (role_code, function, a_*)  ← default per role per function
       ↑
       │ role_code
       │
t_employee (uid, employee_code, default_shopcode, role_code, ...)
       │
       │ employee_code (+ shop_code)
       └──────────────────────────→ t_employee_access (employee_code, shop_code, function, a_*)
                                              │
                                              └── actual permissions (what the app enforces)
```

- **t_employee** references **t_employee_role** by **role_code**.
- **t_employee_access_default** is keyed by **(role_code, function)** and references **t_employee_role**; it provides default create/edit/delete/view per role per function.
- **t_employee_access** is keyed by **(employee_code, shop_code, function)** and holds actual permissions; it can be initialised or reset from **t_employee_access_default** using the employee’s **role_code**.
