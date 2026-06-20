import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/services/dbService';
import { systemLogger } from '@/lib/simple-logger';

/** Aligns with system pagination max; prevents oversized requests and SQL injection via LIMIT. */
const CUSTOMERS_LIST_MAX_LIMIT = 5000;

function jsonStringifySafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function parseLimitOffset(
  limitStr: string | null,
  offsetStr: string | null,
  pageStr: string | null
): { limit: number; offset: number } | null {
  if (!limitStr) return null;
  const limitRaw = parseInt(limitStr, 10);
  const limit = Math.min(
    Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10),
    CUSTOMERS_LIST_MAX_LIMIT
  );
  let offset = 0;
  if (offsetStr) {
    const o = parseInt(offsetStr, 10);
    offset = Math.max(0, Number.isFinite(o) ? o : 0);
  } else if (pageStr) {
    const pageNum = parseInt(pageStr, 10);
    if (Number.isFinite(pageNum) && pageNum > 1) {
      offset = (pageNum - 1) * limit;
    }
  }
  return { limit, offset };
}

// GET - Fetch all customers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');
    const page = searchParams.get('page');
    const offset = searchParams.get('offset');
    const status = searchParams.get('status');
    const pmCode = searchParams.get('pm_code');
    const fields = searchParams.get('fields');

    // Define all possible fields in the customers table (+ joined names from lookup tables)
    const ALL_ALLOWED_FIELDS = [
      'cust_code', 'name', 'attn_1', 'attn_2', 'delivery_addr', 
      'phone_1', 'phone_2', 'fax_1', 'fax_2', 
      'pm_code', 'pt_code', 'status', 'district_code', 
      'from_time', 'to_time', 'delivery_remark', 
      'create_date', 'modify_date', 
      'remark', 'statement_remark', 
      'email_1', 'email_2',
      'payment_method', 'payment_term' // from JOINs with t_payment_method, t_payment_term
    ];

    // Modify the default fields to always include email fields and pm_code for list display
    const baseFields = [
      'cust_code', 
      'name', 
      'attn_1', 
      'phone_1', 
      'status',
      'attn_2',
      'phone_2',
      'fax_2',
      'pm_code',
      'pt_code'
    ];

    const emailFields = [
      'email_1', 
      'email_2'
    ];

    // If fields are provided, validate them strictly
    const selectedFields: string[] = fields
      ? fields.split(',').map(f => f.trim())
      : [...baseFields, ...emailFields];

    const invalidFields = selectedFields.filter(field => 
      !ALL_ALLOWED_FIELDS.includes(field)
    );
    if (invalidFields.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid fields requested',
        details: {
          invalidFields: invalidFields,
          allowedFields: ALL_ALLOWED_FIELDS
        }
      }, { status: 400 });
    }

    // Build SELECT: customer columns with c. prefix, and joined names (exclude payment_method/payment_term from c. list; we add them from JOINs)
    const customerOnlyFields = selectedFields.filter(f => f !== 'payment_method' && f !== 'payment_term');
    const selectList = customerOnlyFields.map(f => `c.${f}`).join(', ');
    const joinSelect = ' pm.payment_method AS payment_method, pt.terms AS payment_term';
    let query = `SELECT ${selectList},${joinSelect}
      FROM t_customers c
      LEFT JOIN t_payment_method pm ON c.pm_code = pm.pm_code
      LEFT JOIN t_payment_term pt ON c.pt_code = pt.pt_code`;
    // Alias `c` so WHERE qualifies customer columns. Required when JOINing
    // t_payment_method (also has pm_code) to avoid "Column 'pm_code' in WHERE is ambiguous".
    let countQuery = 'SELECT COUNT(*) as total FROM t_customers c';
    const params: (string | number)[] = [];
    const countParams: (string | number)[] = [];

    // Build WHERE clause (always qualify with c. for the main + count queries)
    const whereConditions: string[] = [];
    
    if (search) {
      // If it's a customer code lookup (exact match)
      if (/^[A-Z][0-9]{6}$/.test(search)) {
        whereConditions.push('c.cust_code = ?');
        params.push(search);
        countParams.push(search);
      } else {
        // For general search (partial match)
        whereConditions.push(
          '(c.cust_code LIKE ? OR c.name LIKE ? OR c.attn_1 LIKE ? OR c.phone_1 LIKE ?)'
        );
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }
    }
    
    if (status) {
      whereConditions.push('c.status = ?');
      params.push(status);
      countParams.push(status);
    }
    
    if (pmCode) {
      whereConditions.push('c.pm_code = ?');
      params.push(pmCode);
      countParams.push(pmCode);
    }
    
    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }
    
    query += ' ORDER BY c.name';
    
    // Pagination: use literal LIMIT/OFFSET after integer validation. Some MySQL/MariaDB
    // builds mis-handle bound parameters for LIMIT/OFFSET in prepared statements.
    const limitOffset = parseLimitOffset(limit, offset, page);
    if (limitOffset) {
      query += ` LIMIT ${limitOffset.limit} OFFSET ${limitOffset.offset}`;
    }
    
    // Get paginated data
    const rows = await executeQuery<Record<string, unknown>[]>(query, params);
    const dataRows = Array.isArray(rows) ? rows : [];

    // Get total count
    const countResult = await executeQuery<Array<{ total: unknown }>>(countQuery, countParams);
    const rawTotal =
      Array.isArray(countResult) && countResult.length > 0 ? countResult[0].total : dataRows.length;
    const totalCount = Number(rawTotal);

    // Only get statistics if explicitly requested
    const getStats = searchParams.get('include_stats') === 'true';
    let stats = null;
    
    if (getStats) {
      try {
        systemLogger.info('Getting statistics for customers');
        const statsQuery = `
        SELECT 
          COUNT(*) as total_customers,
          COUNT(CASE WHEN UPPER(TRIM(status)) = 'ACTIVE' THEN 1 END) as active_customers,
          COUNT(CASE WHEN UPPER(TRIM(status)) IN ('CLOSED', 'INACTIVE') THEN 1 END) as inactive_customers,
          GROUP_CONCAT(DISTINCT status) as status_list,
          GROUP_CONCAT(DISTINCT UPPER(TRIM(status))) as normalized_status_list
        FROM t_customers
      `;

        const statsResult = await executeQuery<
          Array<{
            total_customers: number;
            active_customers: number;
            inactive_customers: number;
            status_list: string;
            normalized_status_list: string;
          }>
        >(statsQuery, []);
        systemLogger.debug('Customer statistics query result', { statsResult });
        stats = statsResult && statsResult.length > 0 ? statsResult[0] : null;
        systemLogger.debug('Processed customer statistics', { stats });
      } catch (statsErr) {
        const se = statsErr as Error & { code?: string; errno?: number };
        systemLogger.error(
          'Customer list stats query failed (list still returned)',
          statsErr instanceof Error ? statsErr : undefined,
          { sqlCode: se.code, errno: se.errno }
        );
        stats = null;
      }
    }
    
    const response = {
      success: true,
      data: dataRows,
      total: Number.isFinite(totalCount) ? totalCount : dataRows.length,
      ...(stats && {
        statistics: {
          totalCustomers: Number(stats.total_customers) || 0,
          activeCustomers: Number(stats.active_customers) || 0,
          inactiveCustomers: Number(stats.inactive_customers) || 0,
          debug: {
            rawStatusList: stats.status_list,
            normalizedStatusList: stats.normalized_status_list
          }
        }
      }),
      timestamp: new Date().toISOString()
    };
    
    systemLogger.debug('Customer API response', { 
      success: response.success,
      dataCount: Array.isArray(response.data) ? response.data.length : 0,
      total: response.total,
      hasStatistics: !!response.statistics,
      statistics: response.statistics
    });
    return new NextResponse(jsonStringifySafe(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
    
  } catch (error) {
    const e = error as Error & { code?: string; errno?: number; sqlState?: string; sqlMessage?: string };
    systemLogger.error('Database error during customer fetch', e instanceof Error ? e : undefined, {
      sqlCode: e.code,
      errno: e.errno,
      sqlState: e.sqlState,
      sqlMessage: e.sqlMessage,
    });
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch customers',
        details: e instanceof Error ? e.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST - Add new customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Log received data using system logger
    systemLogger.debug('Received customer data', { 
      body: JSON.stringify(body, null, 2) 
    });

    // Insert new customer with create_date and modify_date
    const allowedFields = [
      'cust_code', 'name', 'attn_1', 'delivery_addr', 'phone_1', 'pm_code', 'pt_code', 
      'status', 'email_1', 'email_2', 'remark', 'statement_remark', 'district_code', 
      'from_time', 'to_time', 'delivery_remark', 'fax_1', 'fax_2', 'attn_2', 'phone_2'
    ];

    // Prepare dynamic fields and values
    const insertFields: string[] = ['create_date', 'modify_date'];
    const insertValues: (string | number)[] = ['CURRENT_TIMESTAMP()', 'CURRENT_TIMESTAMP()'];
    const params: (string | number)[] = [];

    systemLogger.debug('Allowed fields', { allowedFields });

    // Validate and collect fields to insert
    const fieldsToInsert: {[key: string]: string | number} = {};
    allowedFields.forEach(field => {
      if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
        fieldsToInsert[field] = body[field];
        insertFields.push(field);
        insertValues.push('?');
        params.push(body[field]);
      }
    });

    systemLogger.debug('Fields to insert', { 
      fieldsToInsert, 
      insertFields, 
      insertValues, 
      params 
    });

    // Ensure required fields are present
    if (!body.cust_code || !body.name || !body.phone_1) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: Customer Code, Name, and Phone are required' 
        },
        { status: 400 }
      );
    }

    // Construct dynamic SQL query
    const query = `
      INSERT INTO t_customers (${insertFields.join(', ')}) 
      VALUES (${insertValues.join(', ')})
    `;

    await executeQuery(query, params);
    
    return NextResponse.json({
      success: true,
      message: 'Customer added successfully',
      customer: {
        ...body,
        create_date: new Date().toISOString(),
        modify_date: new Date().toISOString()
      }
    });
    
  } catch (error) {
    systemLogger.error('Database error during customer creation', error as Error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add customer',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PATCH - Update customer
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.cust_code) {
      return NextResponse.json(
        { success: false, error: 'Customer code is required' },
        { status: 400 }
      );
    }

    const updateFields: string[] = [];
    const params: (string | number)[] = [];
    
    // Only real t_customers columns (not GET join aliases like payment_method / payment_term).
    const allowedFields = [
      'name',
      'attn_1',
      'attn_2',
      'delivery_addr',
      'phone_1',
      'phone_2',
      'fax_1',
      'fax_2',
      'email_1',
      'email_2',
      'pm_code',
      'pt_code',
      'status',
      'district_code',
      'from_time',
      'to_time',
      'delivery_remark',
      'remark',
      'statement_remark',
    ];
    
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        params.push(body[field]);
      }
    });

    // Always update modify_date to current timestamp
    updateFields.push('modify_date = CURRENT_TIMESTAMP()');

    params.push(body.cust_code);

    const query = `
      UPDATE t_customers
      SET ${updateFields.join(', ')}
      WHERE cust_code = ?
    `;

    await executeQuery(query, params);
    
    return NextResponse.json({
      success: true,
      message: 'Customer updated successfully',
      customer: body
    });
    
  } catch (error) {
    systemLogger.error('Error updating customer', error as Error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Database error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete customer
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { cust_code, confirm } = body;
    
    // Validate input
    if (!cust_code) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Customer code is required' 
        },
        { status: 400 }
      );
    }
    
    // Check if customer exists
    const customerExists = await executeQuery<Array<{ cnt: number }>>(
      'SELECT COUNT(*) as cnt FROM t_customers WHERE cust_code = ?',
      [cust_code]
    );
    
    if (customerExists[0].cnt === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Customer not found' 
      }, { status: 404 });
    }

    // Check for related transactions in transaction_h
    const checkResult = await executeQuery<Array<{ cnt: number }>>(
      'SELECT COUNT(*) as cnt FROM t_transaction_h WHERE cust_code = ?',
      [cust_code]
    );
    
    const count = checkResult[0].cnt || 0;
    if (count > 0) {
      return NextResponse.json({ 
        success: true, 
        canDelete: false,
        error: 'Customer has related transactions and cannot be deleted',
        dependencies: {
          transactions: count
        }
      });
    }

    // If this is just a check (not confirmed), return canDelete: true
    if (!confirm) {
      return NextResponse.json({
        success: true,
        canDelete: true,
        message: 'Customer can be deleted'
      });
    }
    
    // Delete customer
    await executeQuery(
      'DELETE FROM t_customers WHERE cust_code = ?',
      [cust_code]
    );
    
    return NextResponse.json({
      success: true,
      deleted: true,
      message: 'Customer deleted successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    systemLogger.error('Database error during customer deletion', error as Error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete customer',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 
