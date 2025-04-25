const pool = require('./db');

const createTables = async () => {
    const query = `
    CREATE TABLE IF NOT EXISTS Users (
        id_user SERIAL PRIMARY KEY not null,
        phone_number VARCHAR(50) NOT NULL,
        role varchar(10) not null,
        player_id varchar(50),
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS Volunteers (
        id_volunteer SERIAL PRIMARY KEY not null,
        id_user int not null references Users(id_user),
        last_name VARCHAR(50) NOT NULL,
        name VARCHAR(50) NOT NULL,
        middle_name VARCHAR(50),
        gender VARCHAR(10) not null,
        date_of_birth varchar(50) not null,
        passport_serial int NOT NULL,
        passport_number int NOT NULL,
        dobro_id int,
        help_hours int default 0,
        completed_tasks int default 0,
        rating varchar(50) default 0.0
    );

    CREATE TABLE IF NOT EXISTS Clients (
        id_client SERIAL PRIMARY KEY not  null,
        id_user int not null references Users(id_user),
        last_name VARCHAR(50) NOT NULL,
        name VARCHAR(50) NOT NULL,
        middle_name VARCHAR(50),
        gender VARCHAR(10) not null,
        date_of_birth varchar(50) not null
    );

    CREATE TABLE IF NOT EXISTS Tasks (
        id_task SERIAL PRIMARY KEY NOT NULL,
        task_number varchar(50),
        id_client INT NOT NULL REFERENCES Clients(id_client),
        id_volunteers INT[] NOT NULL,
        task_name VARCHAR(50) NOT NULL,
        task_description VARCHAR(100) NOT NULL,
        task_comment VARCHAR(50),
        task_categories VARCHAR[] NOT NULL,
        task_volunteers_count INT NOT NULL,
        task_duration VARCHAR(50) NOT NULL,
        task_start_date VARCHAR(50) NOT NULL,
        task_start_time VARCHAR(50) NOT NULL,
        task_end_date VARCHAR(50),
        task_end_time VARCHAR(50),
        task_address VARCHAR(200) NOT NULL,
        task_coordinates VARCHAR(100),
        task_status VARCHAR(50) NOT NULL
    );
    `;
    try {
        await pool.query(query);
        console.log('✅ Таблицы созданы!');
    } catch (error) {
        console.error('❌ Ошибка при создании таблиц:', error);
    } finally {
        pool.end(); 
    }
};

const createTriggers = async () => {
    const query = `
    CREATE OR REPLACE FUNCTION generate_task_number()
    RETURNS TRIGGER AS $$
    DECLARE
        next_number INT;
        date_prefix VARCHAR(8);
    BEGIN
        date_prefix := TO_CHAR(NOW(), 'YYYYMMDD');

        SELECT COUNT(*) + 1 INTO next_number
        FROM Tasks
        WHERE task_number LIKE date_prefix || '-%';

        NEW.task_number := date_prefix || '-' || LPAD(next_number::TEXT, 4, '0');

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER tasks_before_insert
    BEFORE INSERT ON Tasks
    FOR EACH ROW
    EXECUTE FUNCTION generate_task_number();

    `;
    try {
        await pool.query(query);
        console.log('✅ Таблицы созданы!');
    } catch (error) {
        console.error('❌ Ошибка при создании таблиц:', error);
    } finally {
        pool.end(); 
    }
};

createTables();
createTriggers();
