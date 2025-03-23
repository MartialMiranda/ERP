import jwt from 'jsonwebtoken';

export class JwtService {
    private readonly JWT_SECRET = process.env.JWT_SECRET!;
    private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

    generateTokens(userId: number) {
        const accessToken = jwt.sign({ userId }, this.JWT_SECRET, { expiresIn: '15m' });
        const refreshToken = jwt.sign({ userId }, this.JWT_REFRESH_SECRET, { expiresIn: '7d' });
        return { accessToken, refreshToken };
    }

    verifyToken(token: string) {
        return jwt.verify(token, this.JWT_SECRET);
    }

    verifyRefreshToken(token: string) {
        return jwt.verify(token, this.JWT_REFRESH_SECRET);
    }
}
