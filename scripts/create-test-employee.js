const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Database configuration
const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'dbadmin',
  password: 'dbadmin',
  database: 'teamwork',
};

async function createTestEmployee() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database successfully');
    
    // Hash the password
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('\n🔐 Password hashed successfully');
    console.log('Plain password:', password);
    console.log('Hashed password:', hashedPassword);
    
    // Check if employee already exists
    const [existing] = await connection.execute(
      'SELECT * FROM t_employee WHERE username = ?',
      ['admin']
    );
    
    if (existing.length > 0) {
      console.log('\n⚠️  Employee "admin" already exists. Updating password...');
      await connection.execute(
        'UPDATE t_employee SET password = ?, status = 1, modify_date = NOW() WHERE username = ?',
        [hashedPassword, 'admin']
      );
      console.log('✅ Password updated successfully');
    } else {
      console.log('\n📝 Creating new test employee...');
      
      // Insert test employee
      const [result] = await connection.execute(
        `INSERT INTO t_employee (employee_code, username, password, default_shopcode, role_code, status, create_date, modify_date)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [1001, 'admin', hashedPassword, 'SHOP001', 1, 1]
      );
      
      console.log('✅ Test employee created successfully');
      console.log('Insert ID:', result.insertId);
    }
    
    // Display the test employee data
    const [employees] = await connection.execute(
      'SELECT uid, employee_code, username, default_shopcode, role_code, status, create_date FROM t_employee WHERE username = ?',
      ['admin']
    );
    
    console.log('\n📋 Test Employee Details:');
    console.table(employees);
    
    console.log('\n🎉 Setup complete! You can now login with:');
    console.log('   Username: admin');
    console.log('   Password: password123');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('Error Code:', error.code);
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the script
createTestEmployee();

