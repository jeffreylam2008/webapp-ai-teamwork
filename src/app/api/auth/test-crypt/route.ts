import { NextRequest, NextResponse } from 'next/server';
import { verifyPhpCrypt, phpCrypt, testPhpCrypt } from '@/lib/phpCrypt';
import dbService from '@/lib/database';

/**
 * Test endpoint for PHP crypt() verification
 */

interface EmployeeRecord {
  uid: number;
  employee_code: number;
  username: string;
  password: string;
  status: number;
}

export async function GET() {
  try {
    console.log('\n=== PHP Crypt() Test Endpoint ===\n');
    
    testPhpCrypt();
    
    const result = await dbService.query<EmployeeRecord>(
      `SELECT uid, employee_code, username, password, status 
       FROM t_employee 
       WHERE password LIKE 'pa%' 
       LIMIT 5`,
      []
    );
    
    const employees = result.data || [];
    
    console.log('\n=== Database Employees with PHP Crypt ===');
    console.log(`Found ${employees.length} employees with crypt() passwords`);
    
    const testResults = employees.map((emp: EmployeeRecord) => {
      return {
        uid: emp.uid,
        username: emp.username,
        employee_code: emp.employee_code,
        password_hash: emp.password,
        hash_format: emp.password.substring(0, 2),
        status: emp.status
      };
    });
    
    return NextResponse.json({
      success: true,
      message: 'PHP crypt() test endpoint',
      data: {
        employees: testResults,
        instructions: {
          test_specific: 'POST /api/auth/test-crypt with {"username": "xxx", "password": "xxx"}',
          test_hash: 'POST /api/auth/test-crypt with {"password": "xxx", "hash": "xxx"}',
          login: 'POST /api/auth/login-crypt with {"username": "xxx", "password": "xxx"}'
        }
      }
    });
    
  } catch (error) {
    console.error('[TEST-CRYPT] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Test failed', details: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Test Case 1: Verify with username (fetch from DB)
    if (body.username && body.password) {
      console.log('\n=== Testing with Username ===');
      console.log('Username:', body.username);
      
      const result = await dbService.query(
        `SELECT uid, employee_code, username, password, status 
         FROM t_employee 
         WHERE username = ?`,
        [body.username]
      );
      
      if (!result.data || result.data.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'User not found'
        }, { status: 404 });
      }
      
      const employee = result.data[0];
      const isValid = verifyPhpCrypt(body.password, employee.password);
      
      return NextResponse.json({
        success: true,
        data: {
          username: employee.username,
          employee_code: employee.employee_code,
          password_hash: employee.password,
          test_password: body.password,
          verification_result: isValid,
          message: isValid ? '✓ Password matches!' : '✗ Password does not match'
        }
      });
    }
    
    // Test Case 2: Verify with direct hash
    if (body.password && body.hash) {
      console.log('\n=== Testing with Direct Hash ===');
      console.log('Password:', body.password);
      console.log('Hash:', body.hash);
      
      const isValid = verifyPhpCrypt(body.password, body.hash);
      
      return NextResponse.json({
        success: true,
        data: {
          test_password: body.password,
          test_hash: body.hash,
          verification_result: isValid,
          message: isValid ? '✓ Password matches hash!' : '✗ Password does not match hash'
        }
      });
    }
    
    // Test Case 3: Generate hash
    if (body.generate && body.password) {
      console.log('\n=== Generating Hash ===');
      console.log('Password:', body.password);
      
      // Use default salt "pa" (from "password")
      const salt = body.salt || 'pa';
      const hash = phpCrypt(body.password, salt);
      
      return NextResponse.json({
        success: true,
        data: {
          password: body.password,
          salt: salt,
          generated_hash: hash,
          message: 'Hash generated successfully'
        }
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid request. Provide either {username, password} or {password, hash} or {generate: true, password}'
    }, { status: 400 });
    
  } catch (error) {
    console.error('[TEST-CRYPT] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Test failed', details: errorMessage },
      { status: 500 }
    );
  }
}

