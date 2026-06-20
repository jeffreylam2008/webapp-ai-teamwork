import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verifyPhpCrypt } from '@/lib/phpCrypt';
import { getRequestIp, getRequestUserAgent } from '@/lib/audit';
import { userActionLogger } from '@/lib/simple-logger';
import { isRequestHttps } from '@/lib/requestHttps';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

interface ShopRecord { shop_code: string; name: string; }
interface EmployeeRecord { uid: number; employee_code: number; username: string; password: string; default_shopcode: string; role_code: number; status: number; }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, shop_code } = body;

    // Use the shop selected on login when provided and non-empty; otherwise fall back to employee default
    const requestedShopCode = typeof shop_code === 'string' && shop_code.trim() ? shop_code.trim() : null;

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    console.log('[AUTH] Login attempt for username:', username, 'shop_code:', requestedShopCode);

    // Validate shop if provided
    let selectedShop: ShopRecord | null = null;
    if (requestedShopCode) {
      const shopResult = await dbService.query<ShopRecord>(
        'SELECT shop_code, name FROM t_shop WHERE shop_code = ?',
        [requestedShopCode]
      );
      
      if (!shopResult.data || shopResult.data.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid shop selected' },
          { status: 400 }
        );
      }
      
      selectedShop = shopResult.data[0];
      console.log('[AUTH] Shop validated:', selectedShop);
    }

    // Query employee from database
    const result = await dbService.query<EmployeeRecord>(
      `SELECT uid, employee_code, username, password, default_shopcode, role_code, status 
       FROM t_employee 
       WHERE username = ? AND status = 1`,
      [username]
    );

    if (!result.data || result.data.length === 0) {
      console.log('[AUTH] User not found or inactive');
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // When employees share the same username (e.g. one per shop), require that the selected shop actually has
    // an account for this username. If no employee row exists for the chosen shop, reject the login.
    const employees = result.data as EmployeeRecord[];
    let employee: EmployeeRecord | null = null;

    if (requestedShopCode) {
      const match = employees.find((e) => e.default_shopcode === requestedShopCode);
      if (!match) {
        console.log('[AUTH] No employee for username in selected shop:', username, requestedShopCode);
        return NextResponse.json(
          { success: false, error: 'Invalid username or password' },
          { status: 401 }
        );
      }
      employee = match;
    } else {
      employee = employees[0];
    }

    // Verify password - support both bcrypt and PHP crypt()
    let isPasswordValid = false;
    
    if (employee.password.startsWith('$2')) {
      // Bcrypt password
      console.log('[AUTH] Verifying bcrypt password');
      isPasswordValid = await bcrypt.compare(password, employee.password);
    } else if (employee.password.startsWith('pa')) {
      // PHP crypt() password
      console.log('[AUTH] Verifying PHP crypt() password');
      isPasswordValid = verifyPhpCrypt(password, employee.password);
    } else {
      // Unknown format
      console.log('[AUTH] Unknown password format:', employee.password.substring(0, 3));
      return NextResponse.json(
        { success: false, error: 'Invalid password format' },
        { status: 500 }
      );
    }

    if (!isPasswordValid) {
      console.log('[AUTH] Invalid password');
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Use the shop selected on login when provided; otherwise fall back to employee default
    const finalShopCode = requestedShopCode || employee.default_shopcode;

    // If no shop_code provided, attempt to resolve shop name for default shop
    if (!selectedShop && finalShopCode) {
      const defaultShopResult = await dbService.query<ShopRecord>(
        'SELECT shop_code, name FROM t_shop WHERE shop_code = ?',
        [finalShopCode]
      );
      if (defaultShopResult.data && defaultShopResult.data.length > 0) {
        selectedShop = defaultShopResult.data[0];
      }
    }

    // Update last login
    await dbService.query(
      `UPDATE t_employee SET last_login = NOW() WHERE uid = ?`,
      [employee.uid]
    );

    // Generate JWT token
    const token = jwt.sign(
      {
        uid: employee.uid,
        employee_code: employee.employee_code,
        username: employee.username,
        default_shopcode: employee.default_shopcode,
        selected_shopcode: finalShopCode,
        selected_shopname: selectedShop ? selectedShop.name : null,
        role_code: employee.role_code
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Update last token in database
    await dbService.query(
      `UPDATE t_employee SET last_token = ? WHERE uid = ?`,
      [token, employee.uid]
    );

    // Record token in t_login table
    // Note: JWT tokens can be longer than 255 chars, so we may need to truncate
    // If token is too long, we'll store a truncated version
    const tokenForLogin = token.length > 255 ? token.substring(0, 255) : token;
    
    await dbService.query(
      `INSERT INTO t_login (username, shop_code, token, status, create_date, modify_date) 
       VALUES (?, ?, ?, 'in', NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         shop_code = VALUES(shop_code),
         token = VALUES(token),
         status = 'in',
         modify_date = NOW()`,
      [employee.username, finalShopCode, tokenForLogin]
    );

    console.log('[AUTH] Login successful for:', username);
    console.log('[AUTH] Token recorded in t_login table');

    userActionLogger.log({
      userId: String(employee.uid),
      username: employee.username,
      action: 'LOGIN',
      resource: 'AUTH',
      details: {
        shop_code: finalShopCode,
        selected_shopname: selectedShop?.name ?? null,
      },
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 200,
    });

    // Return success with token and user info
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          uid: employee.uid,
          employee_code: employee.employee_code,
          username: employee.username,
          default_shopcode: employee.default_shopcode,
          selected_shopcode: finalShopCode,
          selected_shopname: selectedShop ? selectedShop.name : null,
          role_code: employee.role_code
        }
      }
    });
    const isHttps = isRequestHttps(request);
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      // LAN / http://192.168.x.x must not use Secure cookies or the browser drops them.
      secure: isHttps,
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });
    return response;

  } catch (error) {
    console.error('[AUTH] Login error:', error);
    console.error('[AUTH] Error type:', typeof error);
    console.error('[AUTH] Error message:', error instanceof Error ? error.message : 'Not an Error object');
    console.error('[AUTH] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        success: false, 
        error: `Login failed: ${errorMessage}`,
        debug: {
          errorType: typeof error,
          errorMessage: errorMessage,
          isError: error instanceof Error
        }
      },
      { status: 500 }
    );
  }
}

