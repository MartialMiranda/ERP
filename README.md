# ERP Proyecto - Secure REST API

A secure REST API built with Node.js, Express, and PostgreSQL featuring modern authentication with 2FA support.

## Features

- Secure user authentication with JWT
- Two-factor authentication (2FA) with both email and app-based methods
- Role-based access control (admin, gestor, usuario)
- CQRS pattern implementation
- Comprehensive error handling and logging
- Rate limiting for API protection

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Configure environment variables in `.env` file (update with your actual values):

```
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=erp_proyecto
DB_USER=postgres
DB_PASSWORD=postgres

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your_refresh_token_secret_here
JWT_REFRESH_EXPIRES_IN=7d

# Email Configuration (for 2FA)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=no-reply@example.com
```

## Database Setup

1. Create the PostgreSQL database:

```bash
psql -U postgres
```

2. In the PostgreSQL shell, run:

```sql
CREATE DATABASE erp_proyecto;
```

3. Initialize the database schema:

```bash
psql -U postgres -d erp_proyecto -f src/config/init-db.sql
```

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/enable-2fa` - Enable 2FA for a user
- `POST /api/auth/verify-2fa` - Verify 2FA setup

### User Management

- `GET /api/users/profile` - Get current user's profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users` - Get all users (admin only)
- `DELETE /api/users/:id` - Delete a user (admin only)

## Security Features

- Password hashing with bcrypt
- JWT token-based authentication
- Two-factor authentication (2FA)
- Rate limiting to prevent brute force attacks
- Helmet for HTTP security headers
- Input validation with express-validator
- CORS protection

## Project Structure

The project follows the CQRS (Command Query Responsibility Segregation) pattern:

```
src/
  ├── config/           # Configuration files
  ├── middleware/       # Express middleware
  ├── modules/          # Business logic modules
  │   └── auth/         # Authentication module
  │       ├── commands/ # Command handlers (write operations)
  │       └── queries/  # Query handlers (read operations)
  └── routes/           # API routes
```

## License

ISC