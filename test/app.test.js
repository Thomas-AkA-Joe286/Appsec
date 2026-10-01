const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = require('../app');
const db = require('../database');

const testUsername = `testuser_${Date.now()}`;
const testPassword = 'TestPassword123!';
const adminUsername = 'admin';
const adminPassword = 'AdminPassword123!';

function createUser(username, password) {
    return new Promise((resolve, reject) => {
        const hashedPassword = bcrypt.hashSync(password, 10);

        db.run(
            'INSERT OR REPLACE INTO users (username, password, sessionId) VALUES (?, ?, ?)',
            [username, hashedPassword, 0],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

function createSession(username) {
    return new Promise((resolve, reject) => {
        const sessionId = crypto
            .createHash('sha256')
            .update(username)
            .digest('hex');

        db.run(
            'UPDATE users SET sessionId = ? WHERE username = ?',
            [sessionId, username],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(sessionId);
                }
            }
        );
    });
}

beforeAll(async () => {
    await createUser(testUsername, testPassword);
    await createUser(adminUsername, adminPassword);
});

afterAll(() => {
    db.close();
});

describe('Blog application', () => {

    test('1. GET /auth/login should display the login page', async () => {
        const response = await request(app)
            .get('/auth/login');

        expect(response.statusCode).toBe(200);
        expect(response.text).toContain('Login');
    });

    test('2. GET /auth/register should display the registration page', async () => {
        const response = await request(app)
            .get('/auth/register');

        expect(response.statusCode).toBe(200);
        expect(response.text).toContain('Register');
    });

    test('3. Unauthenticated users should be redirected from /', async () => {
        const response = await request(app)
            .get('/');

        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe('/auth/login');
    });

    test('4. Unauthenticated users should be redirected from /new-post', async () => {
        const response = await request(app)
            .get('/new-post');

        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe('/auth/login');
    });

    test('5. Unauthenticated users should receive 403 from /admin', async () => {
        const response = await request(app)
            .get('/admin');

        expect(response.statusCode).toBe(403);
        expect(response.text).toContain('Access denied');
    });

    test('6. Login with invalid credentials should not authenticate the user', async () => {
        const response = await request(app)
            .post('/auth/login')
            .send({
                username: testUsername,
                password: 'WrongPassword!'
            });

        expect(response.statusCode).toBe(200);
        expect(response.text).toContain('Invalid username or password');
    });

    test('7. Login with valid credentials should create a session cookie', async () => {
    const response = await request(app)
        .post('/auth/login')
        .type('form')
        .send({
            username: testUsername,
            password: testPassword
        });

    	expect(response.statusCode).toBe(302);
    	expect(response.headers.location).toBe('/');

    	const cookies = response.headers['set-cookie'];

    	expect(cookies).toBeDefined();
    	expect(cookies.some(cookie => cookie.startsWith('sessionId='))).toBe(true);
    });

    test('8. Authenticated user should be able to access the home page', async () => {
        const sessionId = await createSession(testUsername);

        const response = await request(app)
            .get('/')
            .set('Cookie', `sessionId=${sessionId}`);

        expect(response.statusCode).toBe(200);
        expect(response.text).toContain('My Blog');
    });

    test('9. Authenticated user should be able to access the new-post page', async () => {
        const sessionId = await createSession(testUsername);

        const response = await request(app)
            .get('/new-post')
            .set('Cookie', `sessionId=${sessionId}`);

        expect(response.statusCode).toBe(200);
        expect(response.text).toContain('New Post');
    });

    test('10. Normal authenticated users should not have admin access', async () => {
        const sessionId = await createSession(testUsername);

        const response = await request(app)
            .get('/admin')
            .set('Cookie', `sessionId=${sessionId}`);

        expect(response.statusCode).toBe(403);
        expect(response.text).toContain('Access denied');
    });

});
