# Login System Documentation

## Overview
This system implements a complete authentication system using JWT tokens and the `t_employee` database table.

## Features
- ✅ Login with username/password
- ✅ Password hashing with bcrypt
- ✅ JWT token-based authentication
- ✅ Session management
- ✅ Protected routes
- ✅ User profile display in header
- ✅ Logout functionality
- ✅ Standalone login page (no sidebar/header)
- ✅ Automatic redirect when already authenticated

## Database Table
The system uses the `t_employee` table with the following key fields:
- `uid`: Employee unique ID
- `employee_code`: Employee code number
- `username`: Login username
- `password`: Hashed password (bcrypt)
- `default_shopcode`: Default shop assignment
- `role_code`: User role
- `status`: Active (1) or Inactive (0)
- `last_login`: Last login timestamp
- `last_token`: Current JWT token

## Test Account
A test employee account has been created:
- **Username:** `admin`
- **Password:** `password123`
- **Employee Code:** `1001`
- **Shop Code:** `SHOP001`
- **Role Code:** `1`

## API Endpoints

### POST /api/auth/login
Login with username and password
```json
{
  "username": "admin",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "jwt_token_here",
    "user": {
      "uid": 13,
      "employee_code": 1001,
      "username": "admin",
      "default_shopcode": "SHOP001",
      "role_code": 1
    }
  }
}
```

### GET /api/auth/verify
Verify JWT token (requires Authorization header)
```
Authorization: Bearer <token>
```

### POST /api/auth/logout
Logout and invalidate token (requires Authorization header)

## Usage

### 1. Access the Login Page
Navigate to `/login` in your browser

### 2. Login
Enter the test credentials:
- Username: `admin`
- Password: `password123`

### 3. Navigate the System
After successful login, you'll be redirected to the home page with:
- Your username displayed in the header
- Access to all protected routes
- Logout option in the user dropdown menu

## Creating New Employees

To create a new employee with a hashed password, run:

```bash
node scripts/create-test-employee.js
```

Or manually insert into the database with a hashed password:

```javascript
const bcrypt = require('bcryptjs');
const hashedPassword = await bcrypt.hash('your_password', 10);

// Then insert into database with the hashed password
```

## Security Features

1. **Password Hashing**: All passwords are hashed using bcrypt with a cost factor of 10
2. **JWT Tokens**: Secure token-based authentication with 8-hour expiration
3. **Token Validation**: Tokens are verified against the database on each request
4. **Status Check**: Only active employees (status = 1) can login
5. **Token Invalidation**: Logout clears the token from the database

## Frontend Integration

The system uses React Context API (`AuthContext`) for state management:

```typescript
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuth();
  
  // Use authentication state
  if (!isAuthenticated) {
    return <LoginPrompt />;
  }
  
  return <div>Welcome {user?.username}!</div>;
}
```

## Protecting Routes

To protect a page, wrap it with the `ProtectedRoute` component:

```typescript
import ProtectedRoute from '@/components/ProtectedRoute';

export default function MyPage() {
  return (
    <ProtectedRoute>
      <YourPageContent />
    </ProtectedRoute>
  );
}
```

## Environment Variables

Set the JWT secret in your `.env.local` file:

```
JWT_SECRET=your-super-secret-key-change-this-in-production
```

## Notes

- The login page is accessible to everyone (no authentication required)
- All other pages can optionally be protected using `ProtectedRoute`
- User information persists in localStorage
- Tokens expire after 8 hours
- Failed login attempts return a generic error message for security

## Troubleshooting

### "Invalid username or password"
- Check that the employee exists in the database
- Verify the employee status is 1 (active)
- Ensure the password matches

### "Token expired"
- Login again to get a new token
- Tokens expire after 8 hours of inactivity

### "Cannot read properties of null"
- Make sure `AuthProvider` wraps your app in the layout
- Check that you're using `useAuth()` within a component inside `AuthProvider`

