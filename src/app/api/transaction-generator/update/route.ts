import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

interface UpdateData {
  session_id?: string | null;
  status?: string;
  create_date?: string;
}

export async function POST(request: NextRequest) {
  try {
    console.log('Update API called');
    const { sessionId, updateData }: { sessionId: string; updateData: UpdateData } = await request.json();
    console.log('Received update data:', { sessionId, updateData });

    if (!sessionId) {
      console.error('Missing sessionId in update request');
      return NextResponse.json(
        { success: false, error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    // Check if record exists (by session_id or by uid)
    console.log('Checking if record exists...');
    let checkResult;
    let whereClause;
    let whereValue;

    // If sessionId is numeric, treat it as uid (record ID)
    if (!isNaN(Number(sessionId))) {
      whereClause = 'uid = ?';
      whereValue = Number(sessionId);
      checkResult = await dbService.query(
        'SELECT * FROM t_trans_num_generator WHERE uid = ?',
        [whereValue]
      );
    } else {
      // Otherwise treat it as session_id
      whereClause = 'session_id = ?';
      whereValue = sessionId;
      checkResult = await dbService.query(
        'SELECT * FROM t_trans_num_generator WHERE session_id = ?',
        [whereValue]
      );
    }

    console.log('Record check result:', checkResult);

    if (checkResult.data.length === 0) {
      console.error('Record not found:', sessionId);
      return NextResponse.json(
        { success: false, error: 'Record not found' },
        { status: 404 }
      );
    }

    // Build update query dynamically based on updateData
    const updateFields: string[] = [];
    const updateValues: (string | number | null)[] = [];

    if (updateData.session_id !== undefined) {
      updateFields.push('session_id = ?');
      updateValues.push(updateData.session_id);
    }

    if (updateData.status) {
      updateFields.push('status = ?');
      updateValues.push(updateData.status);
    }

    if (updateData.create_date) {
      updateFields.push('create_date = ?');
      updateValues.push(updateData.create_date);
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid update fields provided' },
        { status: 400 }
      );
    }

    updateValues.push(whereValue); // Add where value for WHERE clause

    const updateQuery = `UPDATE t_trans_num_generator SET ${updateFields.join(', ')} WHERE ${whereClause}`;
    console.log('Update query:', updateQuery);
    console.log('Update values:', updateValues);

    // Update the record
    console.log('Updating record...');
    const updateResult = await dbService.query(updateQuery, updateValues);
    console.log('Update result:', updateResult);

    const response = {
      success: true,
      message: 'Transaction updated successfully',
      updatedRows: updateResult.affectedRows
    };
    console.log('Returning response:', response);

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error updating transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update transaction' },
      { status: 500 }
    );
  }
}
