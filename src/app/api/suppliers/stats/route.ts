import { NextResponse } from 'next/server';
import { getDbService } from '@/services/dbService';

export async function GET() {
  try {
    const db = await getDbService();

    // Get total count
    const [totalResult] = await db.query('SELECT COUNT(*) as total FROM `t_suppliers`');
    const total = (totalResult as unknown as Array<{ total: number }>)[0].total;

    // Get active count
    const [activeResult] = await db.query('SELECT COUNT(*) as total FROM `t_suppliers` WHERE status = ?', ['Active']);
    const active = (activeResult as unknown as Array<{ total: number }>)[0].total;

    // Get inactive count
    const [inactiveResult] = await db.query('SELECT COUNT(*) as total FROM `t_suppliers` WHERE status = ?', ['Closed']);
    const inactive = (inactiveResult as unknown as Array<{ total: number }>)[0].total;

    return NextResponse.json({
      success: true,
      data: {
        totalSuppliers: total,
        activeSuppliers: active,
        inactiveSuppliers: inactive
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching supplier statistics:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch supplier statistics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
