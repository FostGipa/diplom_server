const pool = require('./db');

const createTables = async () => {
    const query = `
    CREATE TABLE IF NOT EXISTS Users (
        id_user SERIAL PRIMARY KEY not null,
        phone_number VARCHAR(50) NOT NULL,
        role varchar(10) not null,
        status varchar(50),
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
        rating varchar(50) default 0.0,
        rating_count int default 0
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

    CREATE TABLE IF NOT EXISTS Moderators (
        id_moderator SERIAL PRIMARY KEY not null,
        id_user int not null references Users(id_user),
        last_name VARCHAR(50) NOT NULL,
        name VARCHAR(50) NOT NULL,
        middle_name VARCHAR(50)
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

    CREATE TABLE IF NOT EXISTS Messages (
        id_message SERIAL PRIMARY KEY NOT NULL,
        id_task INT REFERENCES Tasks(id_task) ON DELETE CASCADE,
        sender_id INT NOT NULL,
        message_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE OR REPLACE FUNCTION on_task_completed()
	RETURNS TRIGGER AS $$
	DECLARE
	    hours NUMERIC := 1;  -- значение по умолчанию
	    parts TEXT[];
	    h INT;
	    m INT;
	BEGIN
	    IF NEW.task_status = 'Завершена' AND OLD.task_status IS DISTINCT FROM 'Завершена' THEN
	        BEGIN
	            -- Разбиваем строку по ":" — например, "1:30" → ['1', '30']
	            parts := string_to_array(NEW.task_duration, ':');
	
	            IF array_length(parts, 1) = 2 THEN
	                h := parts[1]::INT;
	                m := parts[2]::INT;
	                hours := h + (m / 60.0);
	            ELSE
	                -- Если нет ":", пробуем как обычное число
	                hours := regexp_replace(NEW.task_duration, '[^0-9\.]', '', 'g')::NUMERIC;
	            END IF;
	        EXCEPTION
	            WHEN others THEN
	                RAISE NOTICE 'Ошибка парсинга task_duration: %', NEW.task_duration;
	                hours := 1;
	        END;
	
	        IF NEW.id_volunteers IS NOT NULL THEN
	            UPDATE Volunteers
	            SET 
	                completed_tasks = completed_tasks + 1,
	                help_hours = help_hours + hours
	            WHERE id_volunteer = ANY(NEW.id_volunteers);
	        END IF;
	
	        RAISE NOTICE 'Заявка % завершена. Добавлено часов: %', NEW.id_task, hours;
	    END IF;
	
	    RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_task_completed
    AFTER UPDATE ON Tasks
    FOR EACH ROW
    WHEN (OLD.task_status IS DISTINCT FROM NEW.task_status)
    EXECUTE FUNCTION on_task_completed();

    `;
    try {
        await pool.query(query);
        console.log('✅ Таблицы и триггеры созданы!');
    } catch (error) {
        console.error('❌ Ошибка при создании таблиц:', error);
    } finally {
        pool.end(); 
    }
};

createTables();