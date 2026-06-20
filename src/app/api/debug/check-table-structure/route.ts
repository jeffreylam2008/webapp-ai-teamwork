import { NextResponse } from 'next/server';
import dbService from '@/lib/database';

interface TableColumn {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

export async function GET() {
  try {
    console.log('Checking table structure for t_trans_num_generator...');
    
    // Check if table exists and get its structure
    const tableStructure = await dbService.query(
      'DESCRIBE t_trans_num_generator'
    );
    
    console.log('Table structure:', tableStructure);
    
    // Check if status column exists
    const hasStatusColumn = (tableStructure.data as TableColumn[]).some((column) => column.Field === 'status');
    const hasSessionIdColumn = (tableStructure.data as TableColumn[]).some((column) => column.Field === 'session_id');
    console.log('Has status column:', hasStatusColumn);
    console.log('Has session_id column:', hasSessionIdColumn);
    
    // Add missing columns
    if (!hasStatusColumn) {
      console.log('Adding status column...');
      await dbService.query(
        'ALTER TABLE t_trans_num_generator ADD COLUMN status VARCHAR(20) DEFAULT "active"'
      );
      console.log('Status column added successfully');
    }
    
    if (!hasSessionIdColumn) {
      console.log('Adding session_id column...');
      await dbService.query(
        'ALTER TABLE t_trans_num_generator ADD COLUMN session_id VARCHAR(100)'
      );
      console.log('Session_id column added successfully');
    }
    
    // Get updated table structure
    const updatedStructure = await dbService.query(
      'DESCRIBE t_trans_num_generator'
    );
    
    // Also check current data in the table
    const currentData = await dbService.query(
      'SELECT * FROM t_trans_num_generator ORDER BY create_date DESC LIMIT 5'
    );
    
    return NextResponse.json({
      success: true,
      originalStructure: tableStructure.data,
      hasStatusColumn,
      hasSessionIdColumn,
      updatedStructure: updatedStructure.data,
      currentData: currentData.data
    });

  } catch (error) {
    console.error('Error checking table structure:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check table structure' },
      { status: 500 }
    );
  }
}
