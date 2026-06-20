import { NextRequest, NextResponse } from 'next/server';
import { isRequestHttps } from '@/lib/requestHttps';
import dbService from '@/lib/database';
import jwt from 'jsonwebtoken';
import { verifyPhpCrypt } from '@/lib/phpCrypt';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    console.log('[AUTH-CRYPT] Login attempt for username:', username);

    // Query employee from database
    const result = await dbService.query(
      `SELECT uid, employee_code, username, password, default_shopcode, role_code, status 
       FROM t_employee 
       WHERE username = ? AND status = 1`,
      [username]
    );

    if (!result.data || result.data.length === 0) {
      console.log('[AUTH-CRYPT] User not found or inactive');
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const employee = result.data[0];
    console.log('[AUTH-CRYPT] Found employee:', { 
      uid: employee.uid, 
      username: employee.username,
      passwordFormat: employee.password.substring(0, 3)
    });

    // Check password format and verify accordingly
    let isPasswordValid = false;
    
    if (employee.password.startsWith('$2')) {
      // Bcrypt password (from new system)
      console.log('[AUTH-CRYPT] Detected bcrypt password format');
      isPasswordValid = await bcrypt.compare(password, employee.password);
    } else if (employee.password.startsWith('pa')) {
      // PHP crypt() password with salt "password"
      console.log('[AUTH-CRYPT] Detected PHP crypt() password format');
      isPasswordValid = verifyPhpCrypt(password, employee.password);
    } else {
      // Unknown format
      console.log('[AUTH-CRYPT] Unknown password format');
      return NextResponse.json(
        { success: false, error: 'Invalid password format' },
        { status: 500 }
      );
    }

    if (!isPasswordValid) {
      console.log('[AUTH-CRYPT] Invalid password');
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    console.log('[AUTH-CRYPT] Password verified successfully');

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
    const tokenForLogin = token.length > 255 ? token.substring(0, 255) : token;
    
    await dbService.query(
      `INSERT INTO t_login (username, shop_code, token, status, create_date, modify_date) 
       VALUES (?, ?, ?, 'in', NOW(), NOW())`,
      [employee.username, employee.default_shopcode, tokenForLogin]
    );

    console.log('[AUTH-CRYPT] Login successful for user:', username);
    console.log('[AUTH-CRYPT] Token recorded in t_login table');

    // Return success response without password
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _p, ...userWithoutPassword } = employee;

    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: userWithoutPassword
      }
    });
    const isHttps = isRequestHttps(request);
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps,
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });
    return response;

  } catch (error) {
    console.error('[AUTH-CRYPT] Login error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Login failed', details: errorMessage },
      { status: 500 }
    );
  }
}

