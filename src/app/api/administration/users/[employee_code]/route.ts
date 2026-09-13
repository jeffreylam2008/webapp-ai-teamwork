import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  applyRoleDefaultsToEmployee,
  assertCanAssignEmployeeRole,
  canManageEmployeeAccess,
  ensureEmployeeRoleTable,
  getEmployeeRoleForShop,
  getLiveRoleCodeForEmployee,
  isAdministratorEmployee,
  listEmployeeRoles,
  requireAdministratorFromAuth,
} from '@/lib/employeeRoleAccess';
import { ensureEmployeeAccessTable, getUidByEmployeeCodeAndShop } from '@/lib/employeeAccessDb';
import { getEmployeeRoleByCode, isAdministratorRoleCode } from '@/config/rolePermissionDefaults';
import { logEmployeeAdminAction } from '@/lib/audit';

/**
 * PATCH /api/administration/users/[employee_code]
 * - Update role: { role_code, apply_role_defaults? } (full-access editor)
 * - Update status: { status: 0 | 1 } (Administrator only — fast disable/enable)
 */
export async function PATCH(
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

    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || '';
    const editorCode = String(auth.user.employee_code ?? '').trim();
    const editorRoleCode = editorCode
      ? await getLiveRoleCodeForEmployee(editorCode, shopCode || null, auth.user.role_code)
      : Number(auth.user.role_code ?? 0);

    if (editorCode) {
      const canEdit = await canManageEmployeeAccess(editorCode, shopCode || null, editorRoleCode);
      if (!canEdit) {
        return NextResponse.json(
          { success: false, error: 'Only an employee with full access can change employee roles' },
          { status: 403 }
        );
      }
    }

    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const wantsStatus = body.status !== undefined && body.status !== null;
    const wantsRole = body.role_code !== undefined && body.role_code !== null;

    // Fast enable/disable: Administrator only — Body: { status: 0 | 1 }
    if (wantsStatus && !wantsRole) {
      type StatusAudit = {
        success: boolean;
        statusCode: number;
        reason?: string;
        targetUid?: number | null;
        nextStatus?: number;
      };
      let statusAudit: StatusAudit = {
        success: false,
        statusCode: 500,
        reason: 'Unknown error',
      };

      try {
        const admin = await requireAdministratorFromAuth(auth.user);
        if (!admin.ok) {
          statusAudit = {
            success: false,
            statusCode: admin.status,
            reason: 'Forbidden: not Administrator',
          };
          return NextResponse.json(
            { success: false, error: 'Only an Administrator can change employee status' },
            { status: admin.status }
          );
        }

        const nextStatus = Number(body.status) === 1 ? 1 : 0;
        if (String(admin.editorCode) === employeeCode && nextStatus === 0) {
          statusAudit = {
            success: false,
            statusCode: 400,
            reason: 'Cannot disable own account',
            nextStatus,
          };
          return NextResponse.json(
            { success: false, error: 'You cannot disable your own account' },
            { status: 400 }
          );
        }

        let uid = await getUidByEmployeeCodeAndShop(employeeCode, shopCode);
        let targetRoleCode: number | null = null;
        const codeParam = /^\d+$/.test(employeeCode) ? Number(employeeCode) : employeeCode;

        if (uid == null) {
          const fallback = await dbService.query<{ uid: number; role_code: number | null }>(
            'SELECT uid, role_code FROM t_employee WHERE employee_code = ? LIMIT 1',
            [codeParam]
          );
          const row = fallback.data?.[0];
          if (!row) {
            statusAudit = {
              success: false,
              statusCode: 404,
              reason: 'User not found',
              nextStatus,
            };
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
          }
          uid = Number(row.uid);
          targetRoleCode = row.role_code != null ? Number(row.role_code) : null;
        } else {
          const info = await dbService.query<{ role_code: number | null }>(
            'SELECT role_code FROM t_employee WHERE uid = ? LIMIT 1',
            [uid]
          );
          targetRoleCode = info.data?.[0]?.role_code != null ? Number(info.data[0].role_code) : null;
        }
        statusAudit = { ...statusAudit, targetUid: uid, nextStatus };

        if (nextStatus === 0) {
          const targetIsAdmin =
            (targetRoleCode != null && isAdministratorRoleCode(targetRoleCode)) ||
            (await isAdministratorEmployee(employeeCode, shopCode || null, targetRoleCode));
          if (targetIsAdmin) {
            const adminCount = await dbService.query<{ cnt: number }>(
              `SELECT COUNT(*) AS cnt
               FROM t_employee e
               LEFT JOIN t_employee_role r ON r.role_code = e.role_code
               WHERE e.status = 1 AND (e.role_code = 1 OR r.role_key = 'administrator')`
            );
            const count = Number(adminCount.data?.[0]?.cnt ?? 0);
            if (count <= 1) {
              statusAudit = {
                success: false,
                statusCode: 400,
                reason: 'Cannot disable last active Administrator',
                targetUid: uid,
                nextStatus,
              };
              return NextResponse.json(
                { success: false, error: 'Cannot disable the last active Administrator account' },
                { status: 400 }
              );
            }
          }
        }

        await dbService.query('UPDATE t_employee SET status = ?, modify_date = NOW() WHERE uid = ?', [
          nextStatus,
          uid,
        ]);

        statusAudit = {
          success: true,
          statusCode: 200,
          reason: nextStatus === 1 ? 'Employee enabled' : 'Employee disabled',
          targetUid: uid,
          nextStatus,
        };
        return NextResponse.json({
          success: true,
          data: { employee_code: employeeCode, status: nextStatus },
          message: nextStatus === 1 ? 'Employee enabled' : 'Employee disabled',
        });
      } finally {
        void logEmployeeAdminAction({
          request,
          action: 'EDIT',
          resource: 'EMPLOYEE_STATUS',
          success: statusAudit.success,
          statusCode: statusAudit.statusCode,
          reason: statusAudit.reason,
          targetEmployeeCode: employeeCode,
          targetUid: statusAudit.targetUid,
          details: {
            status: statusAudit.nextStatus,
            status_label:
              statusAudit.nextStatus === 1
                ? 'enabled'
                : statusAudit.nextStatus === 0
                  ? 'disabled'
                  : undefined,
          },
        });
      }
    }

    const roleCode = Number(body.role_code);
    if (!Number.isFinite(roleCode) || roleCode <= 0) {
      return NextResponse.json({ success: false, error: 'Valid role_code is required' }, { status: 400 });
    }

    await ensureEmployeeRoleTable();
    const role = getEmployeeRoleByCode(roleCode);
    const roles = await listEmployeeRoles();
    const roleExists = role != null || roles.some((r) => r.role_code === roleCode);
    if (!roleExists) {
      return NextResponse.json({ success: false, error: 'Role not found' }, { status: 400 });
    }

    const employee = await getEmployeeRoleForShop(employeeCode, shopCode);
    if (!employee) {
      return NextResponse.json({ success: false, error: 'User not found for this shop' }, { status: 404 });
    }

    if (editorCode) {
      const assignCheck = await assertCanAssignEmployeeRole({
        editorEmployeeCode: editorCode,
        editorShopCode: shopCode || null,
        editorRoleCode,
        targetCurrentRoleCode: employee.role_code,
        targetNewRoleCode: roleCode,
      });
      if (!assignCheck.ok) {
        return NextResponse.json({ success: false, error: assignCheck.error }, { status: 403 });
      }
    }

    const uid = await getUidByEmployeeCodeAndShop(employeeCode, shopCode);
    if (uid == null) {
      return NextResponse.json({ success: false, error: 'User not found for this shop' }, { status: 404 });
    }

    await dbService.query('UPDATE t_employee SET role_code = ?, modify_date = NOW() WHERE uid = ?', [
      roleCode,
      uid,
    ]);

    const applyDefaults = body.apply_role_defaults !== false;
    let permissions: string[] | undefined;
    if (applyDefaults) {
      const effectiveShop = shopCode || employee.default_shopcode || 'HQ01';
      permissions = await applyRoleDefaultsToEmployee(employeeCode, effectiveShop, roleCode);
    }

    const roleName =
      role?.role_name ?? roles.find((r) => r.role_code === roleCode)?.role_name ?? String(roleCode);

    return NextResponse.json({
      success: true,
      data: {
        employee_code: employeeCode,
        role_code: roleCode,
        role_name: roleName,
        permissions,
        apply_role_defaults: applyDefaults,
      },
    });
  } catch (error) {
    console.error('[API] patch user error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/administration/users/[employee_code]
 * Delete an employee (Administrator only). Removes access rows and the employee record.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ employee_code: string }> }
) {
  type DeleteAudit = {
    success: boolean;
    statusCode: number;
    reason?: string;
    targetEmployeeCode?: string;
    targetUid?: number | null;
    targetUsername?: string;
  };
  let audit: DeleteAudit = {
    success: false,
    statusCode: 500,
    reason: 'Unknown error',
  };

  try {
    const { employee_code } = await params;
    const employeeCode =
      typeof employee_code === 'string' ? String(employee_code).trim() : '';
    audit = { ...audit, targetEmployeeCode: employeeCode || undefined };

    const token = extractTokenFromRequest(request);
    if (!token) {
      audit = { ...audit, statusCode: 401, reason: 'Unauthorized' };
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      audit = {
        ...audit,
        statusCode: 401,
        reason: auth.error || 'Unauthorized',
      };
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const admin = await requireAdministratorFromAuth(auth.user);
    if (!admin.ok) {
      audit = {
        ...audit,
        statusCode: admin.status,
        reason: 'Forbidden: not Administrator',
      };
      return NextResponse.json(
        { success: false, error: 'Only an Administrator can delete employees' },
        { status: admin.status }
      );
    }

    if (!employeeCode) {
      audit = { ...audit, statusCode: 400, reason: 'Employee code is required' };
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    if (String(admin.editorCode) === employeeCode) {
      audit = { ...audit, statusCode: 400, reason: 'Cannot delete own account' };
      return NextResponse.json(
        { success: false, error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    const shopCode = admin.shopCode;
    let uid = await getUidByEmployeeCodeAndShop(employeeCode, shopCode);
    let targetRoleCode: number | null = null;
    let targetUsername = '';

    const codeParam = /^\d+$/.test(employeeCode) ? Number(employeeCode) : employeeCode;

    if (uid == null) {
      const fallback = await dbService.query<{
        uid: number;
        role_code: number | null;
        username: string;
      }>('SELECT uid, role_code, username FROM t_employee WHERE employee_code = ? LIMIT 1', [
        codeParam,
      ]);
      const row = fallback.data?.[0];
      if (!row) {
        audit = { ...audit, statusCode: 404, reason: 'User not found' };
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
      uid = Number(row.uid);
      targetRoleCode = row.role_code != null ? Number(row.role_code) : null;
      targetUsername = String(row.username ?? '');
    } else {
      const info = await dbService.query<{ role_code: number | null; username: string }>(
        'SELECT role_code, username FROM t_employee WHERE uid = ? LIMIT 1',
        [uid]
      );
      targetRoleCode = info.data?.[0]?.role_code != null ? Number(info.data[0].role_code) : null;
      targetUsername = String(info.data?.[0]?.username ?? '');
    }
    audit = {
      ...audit,
      targetUid: uid,
      targetUsername,
    };

    const targetIsAdmin =
      (targetRoleCode != null && isAdministratorRoleCode(targetRoleCode)) ||
      (await isAdministratorEmployee(employeeCode, shopCode || null, targetRoleCode));

    if (targetIsAdmin) {
      const adminCount = await dbService.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM t_employee e
         LEFT JOIN t_employee_role r ON r.role_code = e.role_code
         WHERE e.role_code = 1 OR r.role_key = 'administrator'`
      );
      const count = Number(adminCount.data?.[0]?.cnt ?? 0);
      if (count <= 1) {
        audit = {
          ...audit,
          statusCode: 400,
          reason: 'Cannot delete last Administrator',
        };
        return NextResponse.json(
          { success: false, error: 'Cannot delete the last Administrator account' },
          { status: 400 }
        );
      }
    }

    await ensureEmployeeAccessTable();
    await dbService.query('DELETE FROM t_employee_access WHERE employee_code = ?', [
      String(codeParam),
    ]);

    const deleted = await dbService.query('DELETE FROM t_employee WHERE uid = ?', [uid]);
    if ((deleted.affectedRows ?? 0) === 0) {
      audit = { ...audit, statusCode: 404, reason: 'User not found' };
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    audit = {
      success: true,
      statusCode: 200,
      reason: 'Employee deleted',
      targetEmployeeCode: employeeCode,
      targetUid: uid,
      targetUsername,
    };
    return NextResponse.json({
      success: true,
      message: 'Employee deleted',
      data: { employee_code: employeeCode, username: targetUsername },
    });
  } catch (error) {
    console.error('[API] delete user error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    audit = {
      ...audit,
      success: false,
      statusCode: 500,
      reason: msg,
    };
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    void logEmployeeAdminAction({
      request,
      action: 'DELETE',
      resource: 'EMPLOYEE',
      success: audit.success,
      statusCode: audit.statusCode,
      reason: audit.reason,
      targetEmployeeCode: audit.targetEmployeeCode,
      targetUid: audit.targetUid,
      targetUsername: audit.targetUsername,
    });
  }
}

/**
 * PUT /api/administration/users/[employee_code]
 * Update user profile fields. Body: { default_shopcode?: string }
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

    const codeParam = /^\d+$/.test(employeeCode) ? Number(employeeCode) : employeeCode;
    const employeeResult = await dbService.query<{
      uid: number;
      username: string;
      default_shopcode: string | null;
    }>(
      'SELECT uid, username, default_shopcode FROM t_employee WHERE employee_code = ? LIMIT 1',
      [codeParam]
    );
    const employee = employeeResult.data?.[0];
    if (!employee) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const defaultShopcode =
      typeof body.default_shopcode === 'string' ? body.default_shopcode.trim() : '';
    if (!defaultShopcode) {
      return NextResponse.json({ success: false, error: 'Default shop is required' }, { status: 400 });
    }

    const shopCheck = await dbService.query<{ shop_code: string }>(
      'SELECT shop_code FROM t_shop WHERE shop_code = ? LIMIT 1',
      [defaultShopcode]
    );
    if (!shopCheck.data?.length) {
      return NextResponse.json({ success: false, error: 'Invalid shop selected' }, { status: 400 });
    }

    const oldShop = String(employee.default_shopcode || '').trim();
    if (defaultShopcode === oldShop) {
      return NextResponse.json({
        success: true,
        message: 'No changes',
        data: {
          uid: employee.uid,
          employee_code: employeeCode,
          username: employee.username,
          default_shopcode: defaultShopcode,
        },
      });
    }

    const usernameCheck = await dbService.query<{ uid: number }>(
      'SELECT uid FROM t_employee WHERE username = ? AND default_shopcode = ? AND employee_code <> ? LIMIT 1',
      [employee.username, defaultShopcode, employeeCode]
    );
    if (usernameCheck.data?.length) {
      return NextResponse.json(
        { success: false, error: 'Username already exists for the selected shop' },
        { status: 409 }
      );
    }

    const updateResult = await dbService.query(
      'UPDATE t_employee SET default_shopcode = ?, modify_date = NOW() WHERE uid = ?',
      [defaultShopcode, employee.uid]
    );
    if ((updateResult.affectedRows ?? 0) === 0) {
      return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
    }

    if (oldShop) {
      await dbService.query(
        'DELETE FROM t_employee_access WHERE shop_code = ? AND employee_code = ?',
        [defaultShopcode, employeeCode]
      );
      await dbService.query(
        'UPDATE t_employee_access SET shop_code = ? WHERE shop_code = ? AND employee_code = ?',
        [defaultShopcode, oldShop, employeeCode]
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      data: {
        uid: employee.uid,
        employee_code: employeeCode,
        username: employee.username,
        default_shopcode: defaultShopcode,
      },
    });
  } catch (error) {
    console.error('[API] update user error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

