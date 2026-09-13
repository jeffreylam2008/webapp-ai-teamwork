import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { canChangeEmployeePassword } from '@/lib/employeeRoleAccess';
import { logEmployeePasswordAction } from '@/lib/audit';

/** Resolve uid from employee_code. */
async function getUidByEmployeeCode(employeeCode: string): Promise<number | null> {
  const result = await dbService.query<{ uid: number }>(
    'SELECT uid FROM t_employee WHERE employee_code = ?',
    [employeeCode]
  );
  const row = result.data?.[0];
  return row != null && Number.isFinite(row.uid) ? Number(row.uid) : null;
}

/**
 * PUT /api/administration/users/[employee_code]/password
 * Set a new password for the user identified by employee_code in the URL. Body: { new_password: string }.
 * Administrators may change any password; general roles may only change their own.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ employee_code: string }> }
) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    const editorCode = String(auth.user.employee_code ?? '').trim();
    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;
    const passwordCheck = await canChangeEmployeePassword({
      editorEmployeeCode: editorCode,
      editorShopCode: shopCode,
      editorRoleCode: auth.user.role_code,
      targetEmployeeCode: employeeCode,
    });
    if (!passwordCheck.ok) {
      void logEmployeePasswordAction({
        request,
        targetEmployeeCode: employeeCode,
        outcome: 'denied',
        statusCode: 403,
        details: { reason: passwordCheck.error },
      });
      return NextResponse.json({ success: false, error: passwordCheck.error }, { status: 403 });
    }

    const uid = await getUidByEmployeeCode(employeeCode);
    if (uid == null) {
      void logEmployeePasswordAction({
        request,
        targetEmployeeCode: employeeCode,
        outcome: 'not_found',
        statusCode: 404,
      });
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const newPassword = typeof body.new_password === 'string' ? body.new_password.trim() : '';
    if (!newPassword) {
      return NextResponse.json(
        { success: false, error: 'New password is required' },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    const result = await dbService.query(
      'UPDATE t_employee SET password = ?, modify_date = NOW() WHERE uid = ?',
      [hashed, uid]
    );
    const affected = result.affectedRows ?? 0;
    if (affected === 0) {
      void logEmployeePasswordAction({
        request,
        targetEmployeeCode: employeeCode,
        targetUid: uid,
        outcome: 'not_found',
        statusCode: 404,
      });
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    void logEmployeePasswordAction({
      request,
      targetEmployeeCode: employeeCode,
      targetUid: uid,
      outcome: 'success',
      statusCode: 200,
    });

    return NextResponse.json({ success: true, message: 'Password updated' });
  } catch (error) {
    console.error('[API] set user password error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    try {
      const { employee_code } = await params;
      const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
      if (employeeCode) {
        void logEmployeePasswordAction({
          request,
          targetEmployeeCode: employeeCode,
          outcome: 'error',
          statusCode: 500,
          details: { error: msg },
        });
      }
    } catch {
      // ignore audit failure during error path
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
