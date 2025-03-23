import { IAuthService } from '../interfaces/IAuthService';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { JwtService } from './JwtService';
import { Redis } from 'ioredis';

export class AuthService implements IAuthService {
    constructor(
        private db: Pool,
        private jwtService: JwtService,
        private redis: Redis
    ) {}

    async validateCredentials(email: string, password: string): Promise<boolean> {
        const query = 'SELECT contrasena FROM usuarios WHERE email = $1';
        const result = await this.db.query(query, [email]);
        
        if (result.rows.length === 0) return false;
        
        const isValid = await bcrypt.compare(password, result.rows[0].contrasena);

        // Registrar intento de login
        await this.recordLoginAttempt(email, isValid);
        
        return isValid;
    }

    private async recordLoginAttempt(email: string, success: boolean) {
        const key = `login_attempts:${email}`;
        const attempts = await this.redis.incr(key);
        
        if (attempts === 1) {
            await this.redis.expire(key, 3600); // 1 hora
        }

        if (attempts > 5 && !success) {
            throw new Error('Cuenta bloqueada temporalmente');
        }
    }

    async generate2FACode(userId: number): Promise<string> {
        const code = require('crypto').randomBytes(32).toString('hex').slice(0, 6);
        const expireDate = new Date();
        expireDate.setMinutes(expireDate.getMinutes() + 10);

        const query = `
            INSERT INTO autenticacion_2fa (usuario_id, codigo_2fa, expira_en)
            VALUES ($1, $2, $3)
        `;
        await this.db.query(query, [userId, code, expireDate]);
        
        return code;
    }

    async verify2FACode(userId: number, code: string): Promise<boolean> {
        const query = `
            SELECT * FROM autenticacion_2fa 
            WHERE usuario_id = $1 AND codigo_2fa = $2 
            AND expira_en > NOW() 
            ORDER BY generado_en DESC 
            LIMIT 1
        `;
        const result = await this.db.query(query, [userId, code]);
        return result.rows.length > 0;
    }

    async getUser(email: string): Promise<any> {
        const query = 'SELECT * FROM usuarios WHERE email = $1';
        const result = await this.db.query(query, [email]);
        return result.rows[0];
    }
}
