const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'myapp',
    password: process.env.DB_PASSWORD || '123',
    port: process.env.DB_PORT || 5432
});

pool.on('connect', () => {
    console.log('✅ Подключение к PostgreSQL установлено.');
});

module.exports = pool;
