export interface IAuthService {
    validateCredentials(email: string, password: string): Promise<boolean>;
    generate2FACode(userId: number): Promise<string>;
    verify2FACode(userId: number, code: string): Promise<boolean>;
    getUser(email: string): Promise<any>;
}
