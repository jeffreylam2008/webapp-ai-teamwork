import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { systemLogger } from '@/lib/simple-logger';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '10');
  const offset = parseInt(searchParams.get('offset') || '0');
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const pm_code = searchParams.get('pm_code') || '';
  const includeStats = searchParams.get('include_stats') === 'true';

  try {
    const conditions = ['1=1'];
    const values: (string | number)[] = [];

    if (search) {
      conditions.push('(supp_code LIKE ? OR name LIKE ? OR attn_1 LIKE ? OR phone_1 LIKE ?)');
      values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      conditions.push('status = ?');
      values.push(status);
    }

    if (pm_code) {
      conditions.push('pm_code = ?');
      values.push(pm_code);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await dbService.query(
      `SELECT COUNT(*) as total FROM \`t_suppliers\` WHERE ${whereClause}`,
      values
    );
    const total = countResult.data[0].total;

    // Get paginated data
    const dataResult = await dbService.query(
      `SELECT * FROM \`t_suppliers\` WHERE ${whereClause} ORDER BY supp_code LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    
    const data = dataResult.data;

    // Get statistics if requested
    let stats = null;
    if (includeStats) {
      systemLogger.info('Getting statistics for suppliers');
      const statsResult = await dbService.query(`
        SELECT 
          COUNT(*) as total_suppliers,
          COUNT(CASE WHEN UPPER(TRIM(status)) = 'ACTIVE' THEN 1 END) as active_suppliers,
          COUNT(CASE WHEN UPPER(TRIM(status)) IN ('CLOSED', 'INACTIVE') THEN 1 END) as inactive_suppliers
        FROM t_suppliers
      `);
      systemLogger.debug('Supplier statistics query result', { statsResult });
      stats = statsResult.data[0];
      systemLogger.debug('Processed supplier statistics', { stats });
    }

    const response = {
      success: true,
      data,
      total,
      limit,
      offset,
      ...(stats && {
        statistics: {
          totalSuppliers: Number(stats?.total_suppliers) || 0,
          activeSuppliers: Number(stats?.active_suppliers) || 0,
          inactiveSuppliers: Number(stats?.inactive_suppliers) || 0
        }
      }),
      timestamp: new Date().toISOString()
    };

    systemLogger.debug('Supplier API response', { 
      success: response.success,
      dataCount: response.data?.length,
      total: response.total,
      hasStatistics: !!response.statistics,
      statistics: response.statistics
    });
    
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch suppliers',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if supplier code already exists
    const existingResult = await dbService.query(
      'SELECT supp_code FROM `t_suppliers` WHERE supp_code = ?',
      [body.supp_code]
    );

    if (existingResult.data.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Supplier code already exists',
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    // Insert new supplier
    const result = await dbService.query(
      `INSERT INTO \`t_suppliers\` (
        supp_code, name, mail_addr, attn_1, phone_1, fax_1, email_1,
        pm_code, pt_code, remark, status, create_date, modify_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        body.supp_code,
        body.name,
        body.mail_addr,
        body.attn_1,
        body.phone_1,
        body.fax_1,
        body.email_1,
        body.pm_code,
        body.pt_code,
        body.remark,
        body.status || 'Active'
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Supplier created successfully',
      data: { ...body, uid: result.insertId },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating supplier:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create supplier',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if supplier exists
    const existingResult = await dbService.query(
      'SELECT uid FROM `t_suppliers` WHERE supp_code = ?',
      [body.supp_code]
    );

    if (existingResult.data.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Supplier not found',
        timestamp: new Date().toISOString()
      }, { status: 404 });
    }

    // Build update query
    const updateFields = [];
    const values = [];

    // Only update fields that are provided
    if (body.name !== undefined) { updateFields.push('name = ?'); values.push(body.name); }
    if (body.mail_addr !== undefined) { updateFields.push('mail_addr = ?'); values.push(body.mail_addr); }
    if (body.attn_1 !== undefined) { updateFields.push('attn_1 = ?'); values.push(body.attn_1); }
    if (body.phone_1 !== undefined) { updateFields.push('phone_1 = ?'); values.push(body.phone_1); }
    if (body.fax_1 !== undefined) { updateFields.push('fax_1 = ?'); values.push(body.fax_1); }
    if (body.email_1 !== undefined) { updateFields.push('email_1 = ?'); values.push(body.email_1); }
    if (body.pm_code !== undefined) { updateFields.push('pm_code = ?'); values.push(body.pm_code); }
    if (body.pt_code !== undefined) { updateFields.push('pt_code = ?'); values.push(body.pt_code); }
    if (body.remark !== undefined) { updateFields.push('remark = ?'); values.push(body.remark); }
    if (body.status !== undefined) { updateFields.push('status = ?'); values.push(body.status); }

    updateFields.push('modify_date = NOW()');

    // Add supplier code to values array for WHERE clause
    values.push(body.supp_code);

    // Update supplier
    await dbService.query(
      `UPDATE \`t_suppliers\` SET ${updateFields.join(', ')} WHERE supp_code = ?`,
      values
    );

    return NextResponse.json({
      success: true,
      message: 'Supplier updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating supplier:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update supplier',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    // Check if supplier exists
    const existingResult = await dbService.query(
      'SELECT uid FROM `t_suppliers` WHERE supp_code = ?',
      [body.supp_code]
    );

    if (existingResult.data.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Supplier not found',
        timestamp: new Date().toISOString()
      }, { status: 404 });
    }

    // If confirm is not provided, just check if supplier can be deleted
    if (!body.confirm) {
      // Here you can add logic to check if the supplier can be deleted
      // For example, check if there are any related records
      return NextResponse.json({
        success: true,
        canDelete: true,
        timestamp: new Date().toISOString()
      });
    }

    // Delete supplier
    await dbService.query(
      'DELETE FROM `t_suppliers` WHERE supp_code = ?',
      [body.supp_code]
    );

    return NextResponse.json({
      success: true,
      deleted: true,
      message: 'Supplier deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete supplier',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
