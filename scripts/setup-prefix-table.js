const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Database configuration
const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'dbadmin',
  password: 'dbadmin',
  database: 'teamwork',
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000
};

async function setupPrefixTable() {
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database successfully');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'create-prefix-table.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Split the SQL file into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log('📋 Executing SQL statements...');
    console.log('='.repeat(80));
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}:`);
          console.log(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
          
          const [result] = await connection.execute(statement);
          
          if (result.affectedRows !== undefined) {
            console.log(`✅ Affected rows: ${result.affectedRows}`);
          } else if (Array.isArray(result)) {
            console.log(`✅ Retrieved ${result.length} rows`);
            if (result.length > 0 && result.length <= 10) {
              console.table(result);
            }
          }
          
          console.log('');
        } catch (error) {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        }
      }
    }
    
    // Verify the table was created
    console.log('🔍 Verifying table creation...');
    console.log('='.repeat(80));
    
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 't_prefix'"
    );
    
    if (tables.length > 0) {
      console.log('✅ Table t_prefix exists');
      
      // Get table structure
      const [structure] = await connection.execute(
        "DESCRIBE t_prefix"
      );
      
      console.log('\n📋 Table Structure:');
      console.table(structure);
      
      // Get sample data
      const [data] = await connection.execute(
        "SELECT * FROM t_prefix"
      );
      
      console.log('\n📊 Sample Data:');
      console.table(data);
      
    } else {
      console.log('❌ Table t_prefix was not created');
    }
    
  } catch (error) {
    console.error('❌ Database Error:', error.message);
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

// Run the setup
setupPrefixTable();
