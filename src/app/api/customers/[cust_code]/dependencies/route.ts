import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/services/dbService';

// GET - Check customer dependencies
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cust_code: string }> }
) {
  try {
    const { cust_code } = await params;
    
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
    const existing = await executeQuery<Array<{ cust_code: string }>>(
      'SELECT cust_code FROM t_customers WHERE cust_code = ?',
      [cust_code]
    );
    
    if (!Array.isArray(existing) || existing.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Customer not found' 
        },
        { status: 404 }
      );
    }

    // Check for dependencies
    const dependencyChecks = [
      {
        table: 't_transaction_h',
        name: 'transactions',
        query: 'SELECT COUNT(*) as count FROM t_transaction_h WHERE cust_code = ?'
      },
      {
        table: 't_delivery_note',
        name: 'delivery notes',
        query: 'SELECT COUNT(*) as count FROM t_delivery_note WHERE cust_code = ?'
      },
      {
        table: 't_settlement',
        name: 'settlements',
        query: 'SELECT COUNT(*) as count FROM t_settlement WHERE cust_code = ?'
      }
    ];

    const dependencies = [];
    for (const check of dependencyChecks) {
      try {
        const result = await executeQuery<Array<{ count: number }>>(check.query, [cust_code]);
        const count = Array.isArray(result) && result.length > 0 ? result[0].count : 0;
        
        if (count > 0) {
          dependencies.push({
            table: check.table,
            name: check.name,
            count: count
          });
        }
      } catch (checkError) {
        console.warn(`Failed to check dependencies for table ${check.table}:`, checkError);
        // Continue with other checks even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      hasDependencies: dependencies.length > 0,
      dependencies: dependencies,
      totalDependencies: dependencies.reduce((sum, dep) => sum + dep.count, 0)
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check dependencies',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 
