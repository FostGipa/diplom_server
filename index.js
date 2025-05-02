const Dadata = require('dadata-suggestions');
const expressFramework = require('express');
const bodyParserMiddleware = require('body-parser');
const axios = require('axios');
const http = require('http');
const WebSocket = require('ws');
const pool = require('./db/db');
require('dotenv').config();

const app = expressFramework();
const port = process.env.PORT || 3000;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParserMiddleware.json());
const users = new Map(); 

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `ws://${req.headers.host}`);
    const userId = url.searchParams.get("userId");

    if (userId) {
        console.log(`Пользователь ${userId} подключился через WebSocket`);
        users.set(userId, ws);
    }

    ws.on('message', (message) => {
        console.log(`Получено сообщение: ${message}`);
    });

    ws.on('close', () => {
        console.log(`Пользователь ${userId} отключился`);
    });
});

app.post('/bd/complete-task', async (req, res) => {
    const { taskId } = req.body;

    try {
        // Обновляем статус задачи
        const updateResult = await pool.query(
            `UPDATE Tasks SET task_status = 'Завершена' WHERE id_task = $1 RETURNING id_client, id_volunteers`,
            [taskId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: "Задача не найдена" });
        }

        const { id_client, id_volunteers } = updateResult.rows[0];

        // Получаем id_user клиента
        let clientUserId;
        if (id_client) {
            const clientResult = await pool.query(
                `SELECT id_user FROM Clients WHERE id_client = $1`,
                [id_client]
            );
            if (clientResult.rows.length > 0) {
                clientUserId = clientResult.rows[0].id_user;
            }
        }

        // Получаем id_user всех волонтеров
        let volunteerUserIds = [];
        if (id_volunteers && Array.isArray(id_volunteers)) {
            const volunteerResult = await pool.query(
                `SELECT id_user FROM Volunteers WHERE id_volunteer = ANY($1)`,
                [id_volunteers]
            );
            volunteerUserIds = volunteerResult.rows.map(row => row.id_user);
        }

        // Уведомляем клиента
        if (clientUserId) {
            const clientSocket = users.get(String(clientUserId));
            if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
                console.log(`Отправляем сообщение клиенту: ${clientUserId}`);
                clientSocket.send(JSON.stringify({
                    event: "task_completed",
                    taskId: taskId,
                    message: "Задача была успешно завершена!",
                }));
            }
        }

        // Уведомляем всех волонтеров
        volunteerUserIds.forEach(volunteerUserId => {
            const volunteerSocket = users.get(String(volunteerUserId));
            if (volunteerSocket && volunteerSocket.readyState === WebSocket.OPEN) {
                console.log(`Отправляем сообщение волонтеру: ${volunteerUserId}`);
                volunteerSocket.send(JSON.stringify({
                    event: "task_completed",
                    taskId: taskId,
                    message: "Задача была успешно завершена!",
                }));
            }
        });

        return res.status(200).json({ success: "Задача завершена" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Ошибка сервера" });
    }
});

// Отправка кода
app.post('/service/send-otp', async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: "Не указан номер телефона" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000);
    const message = `Ваш код подтверждения: ${otp}`;
    const chatId = `${phone}@c.us`;

    try {
        const response = await axios.post(
            `https://1103.api.green-api.com/waInstance1103187335/sendMessage/8fba3cdae2864c3a92d075de44562b9d7c075cae35c9486086`,
            {
                chatId: chatId,
                message: message
            }
        );

        console.log("OTP отправлен:", response.data);

        return res.status(200).json({ otp }); // Возвращаем OTP клиенту
    } catch (error) {
        console.error('Ошибка при отправке OTP:', error.response ? error.response.data : error.message);
        return res.status(500).json({ error: "Не удалось отправить пароль" });
    }
});

// Подсказки адреса
app.post('/service/suggest/address', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: "Не указан запрос" });
    }
    
    const dadata = new Dadata('5885f65a831be834a8fd754a3402cb9feeb1485b');
    
    try {
        const response = await dadata.address({ query, count: 5 });
        const suggestions = response.suggestions.map(suggestion => ({
            value: suggestion.value,
            unrestricted_value: suggestion.unrestricted_value
        }));

        return res.status(200).json({ suggestions });
    } catch (error) {
        console.error('Ошибка при получении подсказок:', error);
        return res.status(500).json({ error: "Ошибка сервера" });
    }
});

// Подсказки ФИО
app.post('/service/suggest/fio', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: "Не указан запрос" });
    }
    
    const dadata = new Dadata('5885f65a831be834a8fd754a3402cb9feeb1485b');
    
    try {
        const response = await dadata.fio({ query, count: 5 });
        const suggestions = response.suggestions.map(suggestion => ({
            value: suggestion.value,
            unrestricted_value: suggestion.unrestricted_value
        }));

        return res.status(200).json({ suggestions });
    } catch (error) {
        console.error('Ошибка при получении подсказок:', error);
        return res.status(500).json({ error: "Ошибка сервера" });
    }
});

// Добавление нового волонтера
app.post('/bd/new-volunteer', async (req, res) => {
    const { phone_number, last_name, name, middle_name, gender, date_of_birth, passport_serial, passport_number, dobro_id } = req.body;
    
    try {
        // Добавляем пользователя в таблицу Users
        const role = 'Волонтер'
        // Добавляем пользователя в таблицу Users
        const userResult = await pool.query(
            'INSERT INTO Users (phone_number, role) VALUES ($1, $2) RETURNING id_user',
            [phone_number, role]
        );
        
        const id_user = userResult.rows[0].id_user;
        
        // Добавляем волонтера в таблицу Volunteers
        await pool.query(
            `INSERT INTO Volunteers (id_user, last_name, name, middle_name, gender, date_of_birth, passport_serial, passport_number, dobro_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id_user, last_name, name, middle_name, gender, date_of_birth, passport_serial, passport_number, dobro_id]
        );
        
        return res.status(200).json({ success: "Волонтер добавлен" });
    } catch (error) {
        console.error('Ошибка при добавлении волонтера:', error);
        res.status(500).json({ error: `Ошибка сервера: ${error}` });
    }
});

app.post("/bd/check-user", async (req, res) => {
    try {
      const { phone } = req.body;
  
      const result = await pool.query("SELECT id_user FROM users WHERE phone_number = $1", [phone]);
  
      res.status(200).json({ exists: result.rows.length > 0 });
    } catch (error) {
      console.error("Ошибка при проверке пользователя:", error);
      res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Добавление нового клиента
app.post('/bd/new-client', async (req, res) => {
    const { phone_number, last_name, name, middle_name, gender, date_of_birth } = req.body;
    
    try {
        const role = 'Клиент'
        // Добавляем пользователя в таблицу Users
        const userResult = await pool.query(
            'INSERT INTO Users (phone_number, role) VALUES ($1, $2) RETURNING id_user',
            [phone_number, role]
        );
        
        const id_user = userResult.rows[0].id_user;
        
        // Добавляем волонтера в таблицу Clients
        await pool.query(
            `INSERT INTO Clients (id_user, last_name, name, middle_name, gender, date_of_birth)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id_user, last_name, name, middle_name, gender, date_of_birth]
        );
        
        return res.status(200).json({ success: "Клиент добавлен" });
    } catch (error) {
        console.error('Ошибка при добавлении клиента:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post("/bd/new-task", async (req, res) => {
    try {
        const {
            task_name,
            task_description,
            task_comment,
            task_categories,
            id_client,
            id_volunteers,
            task_duration,
            task_volunteers_count,
            task_start_date,
            task_start_time,
            task_end_date,
            task_address,
            task_coordinates,
            task_status
        } = req.body;

        // Вставка новой задачи в базу данных
        const newTask = await pool.query(
            `INSERT INTO tasks (
                task_name, task_description, task_comment, task_categories, id_client,
                id_volunteers, task_volunteers_count, task_duration, task_start_date, task_start_time, 
                task_end_date, task_address, task_coordinates, task_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [
                task_name,
                task_description,
                task_comment,
                task_categories,
                id_client,
                id_volunteers,
                task_volunteers_count,
                task_duration,
                task_start_date,
                task_start_time,
                task_end_date,
                task_address,
                task_coordinates,
                task_status
            ]
        );

        res.status(201).json(newTask.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get("/bd/get-user", async (req, res) => {
    try {
      const { phone } = req.query;
      if (!phone) {
        return res.status(400).json({ message: "Номер телефона обязателен" });
      }
  
      const userResult = await pool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
  
      if (userResult.rows.length === 0) {
        console.error(phone);
        return res.status(404).json({ message: "Пользователь не найден" });
      }
  
      res.status(200).json(userResult.rows[0]);
    } catch (error) {
      console.error("Ошибка при получении пользователя:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
});

app.get("/bd/get-volunteer", async (req, res) => {
try {
    const { id_user } = req.query;
    if (!id_user) {
    return res.status(400).json({ success: false, message: "ID пользователя обязателен" });
    }

    const volunteerResult = await pool.query(`
        SELECT id_volunteer, Volunteers.id_user, phone_number, last_name, "name", middle_name, gender, date_of_birth, passport_serial, passport_number, dobro_id, help_hours, completed_tasks, rating FROM Volunteers 
        JOIN Users ON Volunteers.id_user = Users.id_user
        WHERE Volunteers.id_user = $1
        `, [id_user]);

    if (volunteerResult.rows.length === 0) {
    return res.status(404).json({ success: false, message: "Волонтёр не найден" });
    }

    res.status(200).json(volunteerResult.rows[0]);
} catch (error) {
    console.error("Ошибка при получении волонтёра:", error);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
}
});

app.get("/bd/get-client", async (req, res) => {
    try {
      const { id_user } = req.query;
      if (!id_user) {
        return res.status(400).json({ success: false, message: "ID пользователя обязателен" });
      }
  
      const clientResult = await pool.query(`
        SELECT id_client, Clients.id_user, last_name, "name", middle_name, gender, phone_number FROM Clients 
        JOIN Users ON Clients.id_user = Users.id_user
        WHERE Clients.id_user = $1
        `, [id_user]);
  
      if (clientResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Клиент не найден" });
      }
      res.status(200).json(clientResult.rows[0]);
    } catch (error) {
      console.error("Ошибка при получении клиента:", error);
      res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

app.get("/bd/get-client-tasks", async (req, res) => {
    try {
      const { id_client } = req.query;
      if (!id_client) {
        return res.status(400).json({ success: false, message: "ID клиента обязателен" });
      }
  
      const clientResult = await pool.query(`
        SELECT * FROM Tasks 
        WHERE id_client = $1
        `, [id_client]);
  
      if (clientResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Клиент не найден" });
      }
      res.status(200).json(clientResult.rows);
    } catch (error) {
      console.error("Ошибка при получении задач клиента:", error);
      res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

app.get("/bd/get-volunteer-tasks", async (req, res) => {
    try {
        const { id_volunteer } = req.query;
        if (!id_volunteer) {
            return res.status(400).json({ success: false, message: "ID волонтера обязателен" });
        }

        const volunteerResult = await pool.query(`
            SELECT * FROM Tasks 
            WHERE id_volunteers @> ARRAY[$1::INT]
        `, [id_volunteer]);

        if (volunteerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Задачи для волонтера не найдены" });
        }

        res.status(200).json(volunteerResult.rows);
    } catch (error) {
        console.error("Ошибка при получении задач волонтера:", error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

app.get("/bd/get-all-tasks", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                t.id_task,
                t.task_number,
                t.task_name,
                t.task_description,
                t.task_comment,
                t.task_categories,
                t.task_volunteers_count,
                t.task_start_date,
                t.task_start_time,
                t.task_end_date,
                t.task_end_time,
                t.task_address,
                t.task_coordinates,
                t.task_status,
                c.id_client,
                c.name AS client_name,
                c.last_name AS client_last_name,
                c.middle_name AS client_middle_name,
                c.date_of_birth as client_date_of_birth,
                u_client.phone_number AS client_phone,
                json_agg(json_build_object(
                    'id_volunteer', v.id_volunteer,
                    'name', v.name,
                    'last_name', v.last_name,
                    'middle_name', v.middle_name,
                    'phone_number', u_volunteer.phone_number,
                    'dobro_id', dobro_id
                )) AS volunteers
            FROM Tasks t
            JOIN Clients c ON t.id_client = c.id_client
            JOIN Users u_client ON c.id_user = u_client.id_user
            LEFT JOIN Volunteers v ON v.id_volunteer = ANY(t.id_volunteers)
            LEFT JOIN Users u_volunteer ON v.id_user = u_volunteer.id_user
            GROUP BY t.id_task, c.id_client, u_client.phone_number 
        `);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Задачи для волонтера не найдены" });
        }

        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Ошибка при получении задач волонтера:", error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

app.get("/bd/get-task", async (req, res) => {
    const { taskId } = req.query;
    try {
        const { rows } = await pool.query(
            `SELECT 
                t.id_task,
                t.task_number,
                t.task_name,
                t.task_description,
                t.task_comment,
                t.task_categories,
                t.task_volunteers_count,
                t.task_start_date,
                t.task_start_time,
                t.task_end_date,
                t.task_end_time,
                t.task_address,
                t.task_coordinates,
                t.task_status,
                t.task_duration,
                c.id_client,
                c.name AS client_name,
                c.last_name AS client_last_name,
                c.middle_name AS client_middle_name,
                c.date_of_birth as client_date_of_birth,
                u_client.phone_number AS client_phone,
                json_agg(json_build_object(
                    'id_volunteer', v.id_volunteer,
                    'name', v.name,
                    'last_name', v.last_name,
                    'middle_name', v.middle_name,
                    'phone_number', u_volunteer.phone_number,
                    'dobro_id', dobro_id
                )) AS volunteers
            FROM Tasks t
            JOIN Clients c ON t.id_client = c.id_client
            JOIN Users u_client ON c.id_user = u_client.id_user
            LEFT JOIN Volunteers v ON v.id_volunteer = ANY(t.id_volunteers)
            LEFT JOIN Users u_volunteer ON v.id_user = u_volunteer.id_user
            WHERE t.id_task = $1
            GROUP BY t.id_task, c.id_client, u_client.phone_number`,
            [taskId]
        );
        
        res.json(rows[0]); // Отправляем JSON с задачей
    } catch (error) {
        console.error("Ошибка при получении задачи:", error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

app.post('/service/suggest/address_coordinates', async (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ error: "Не указан адрес" });
    }

    const token = "5885f65a831be834a8fd754a3402cb9feeb1485b";
    const secret = "44bdd2f3b69d35314f26bd4a0cace21b163ec6ae"
    const url = "https://cleaner.dadata.ru/api/v1/clean/address";
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Token ${token}`,
            "X-Secret": secret
        },
        body: JSON.stringify([query])
    };

    try {
        const response = await fetch(url, options);
        const result = await response.json();

        if (!result || result.length === 0) {
            return res.status(404).json({ error: "Адрес не найден" });
        }

        const addressData = result[0];
        const coordinates = {
            latitude: addressData.geo_lat,
            longitude: addressData.geo_lon
        };

        return res.status(200).json({ address: addressData.result, coordinates });
    } catch (error) {
        console.error('Ошибка при получении координат:', error);
        return res.status(500).json({ error: "Ошибка сервера" });
    }
});

app.post('/bd/accept-request', async (req, res) => {
    const { id_task, id_volunteers } = req.body;

    try {
        // Получаем информацию о задаче
        const requestResult = await pool.query(
            'SELECT * FROM Tasks WHERE id_task = $1',
            [id_task]
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }

        const request = requestResult.rows[0];

        // Проверяем, есть ли уже назначенный волонтер
        if (request.task_status === 'В процессе') {
            return res.status(400).json({ error: 'Заявка уже принята волонтером' });
        }

        // Обновляем массив волонтеров, добавляя нового волонтера
        await pool.query(
            'UPDATE Tasks SET id_volunteers = array_append(id_volunteers, $1), task_status = $2 WHERE id_task = $3',
            [id_volunteers, 'В процессе', id_task]
        );

        // Получаем имя и фамилию волонтера
        const volunteerResult = await pool.query(
            'SELECT last_name, name FROM Volunteers WHERE id_volunteer = $1',
            [id_volunteers]
        );

        if (volunteerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Волонтер не найден' });
        }

        const volunteer = volunteerResult.rows[0];
        const volunteerName = `${volunteer.last_name} ${volunteer.name}`;

        const userResult = await pool.query(
            'SELECT id_user FROM Clients WHERE id_client = $1',
            [request.id_client]
          );
          
          if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
          }
          
          const clientUserId = userResult.rows[0].id_user;

        // Отправляем уведомление с именем и фамилией волонтера
        await sendNotification(
            "Заявка принята!",
            `Волонтер ${volunteerName} принял вашу заявку.`,
            clientUserId
          );

        return res.status(200).json({ success: 'Заявка принята' });
    } catch (error) {
        console.error('Ошибка при принятии заявки:', error);
        return res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/bd/update-rating', async (req, res) => {
    const { id_task, new_rating } = req.body;
  
    try {
      // Проверяем правильность оценки
      const userRating = parseFloat(new_rating);
      if (isNaN(userRating) || userRating < 1 || userRating > 5) {
        return res.status(400).json({ error: 'Некорректная оценка. Должна быть от 1 до 5.' });
      }
  
      // Получаем список волонтёров из задачи
      const taskResult = await pool.query(
        'SELECT id_volunteers FROM Tasks WHERE id_task = $1',
        [id_task]
      );
  
      if (taskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Задача не найдена' });
      }
  
      const volunteerIds = taskResult.rows[0].id_volunteers;
  
      if (!volunteerIds || volunteerIds.length === 0) {
        return res.status(400).json({ error: 'У задачи нет волонтёров' });
      }
  
      // Обновляем рейтинг для каждого волонтёра
      for (const id_volunteer of volunteerIds) {
        const volunteerResult = await pool.query(
          'SELECT rating::FLOAT, rating_count FROM Volunteers WHERE id_volunteer = $1',
          [id_volunteer]
        );
  
        if (volunteerResult.rows.length > 0) {
          const currentRating = volunteerResult.rows[0].rating;
          const currentCount = volunteerResult.rows[0].rating_count;
  
          const newCount = currentCount + 1;
          const updatedRating = ((currentRating * currentCount) + userRating) / newCount;
  
          await pool.query(
            'UPDATE Volunteers SET rating = $1, rating_count = $2 WHERE id_volunteer = $3',
            [updatedRating.toFixed(2), newCount, id_volunteer]
          );
        }
      }
  
      return res.status(200).json({ success: 'Рейтинг всех волонтёров обновлён' });
  
    } catch (error) {
      console.error('Ошибка при обновлении рейтинга волонтёров задачи:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/bd/cancel-task', async (req, res) => {
    const { taskId } = req.body;
  
    try {
      // 1. Обновляем статус задачи
      await pool.query(
        'UPDATE Tasks SET task_status = $1 WHERE id_task = $2',
        ['Отменена', taskId]
      );
  
      // 2. Получаем id_volunteers из задачи
      const taskResult = await pool.query(
        'SELECT id_volunteers FROM Tasks WHERE id_task = $1',
        [taskId]
      );
  
      if (taskResult.rowCount === 0) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
  
      const volunteerIds = taskResult.rows[0].id_volunteers; // это id_volunteer[]
  
      if (!volunteerIds || volunteerIds.length === 0) {
        return res.status(200).json({ message: 'Задача отменена (волонтёров не было)' });
      }
  
      // 3. По найденным id_volunteer ищем id_user в таблице Volunteers
      const usersResult = await pool.query(
        'SELECT id_user FROM Volunteers WHERE id_volunteer = ANY($1)',
        [volunteerIds]
      );
  
      const userIds = usersResult.rows.map(row => row.id_user);
  
      if (userIds.length === 0) {
        return res.status(200).json({ message: 'Задача отменена (пользователи не найдены)' });
      }
  
      // 4. Отправляем уведомления пользователям
      for (const userId of userIds) {
        await sendNotification('Задача отменена', 'Задача, на которую вы откликнулись, была отменена.', userId);
      }
  
      return res.status(200).json({ message: 'Задача отменена и уведомления отправлены' });
    } catch (error) {
      console.error('Ошибка при отмене задачи:', error);
      return res.status(500).json({ message: 'Ошибка сервера при отмене задачи' });
    }
});

app.get('/bd/get-chat-messages', async (req, res) => {
    const { taskId } = req.query;

    try {
        // Запрос к базе данных для получения всех сообщений по задаче
        const result = await pool.query(`
            SELECT sender_id, message_text, created_at 
            FROM Messages 
            WHERE id_task = $1 
            ORDER BY created_at ASC
        `, [taskId]);

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/bd/send-message', async (req, res) => {
    const { taskId, senderId, messageText } = req.body;

    try {
        // Добавляем сообщение в базу данных
        const result = await pool.query(`
            INSERT INTO Messages (id_task, sender_id, message_text) 
            VALUES ($1, $2, $3) 
            RETURNING id_message, created_at
        `, [taskId, senderId, messageText]);

        const message = result.rows[0];

        // Получаем id_client и id_volunteers для задачи
        const taskData = await pool.query(`
            SELECT id_client, id_volunteers
            FROM Tasks
            WHERE id_task = $1
        `, [taskId]);

        const { id_client, id_volunteers } = taskData.rows[0];

        // Теперь получаем id_user клиента
        const clientUserQuery = await pool.query(`
            SELECT id_user
            FROM Clients
            WHERE id_client = $1
        `, [id_client]);
        const clientUserId = clientUserQuery.rows[0]?.id_user;

        // Теперь получаем id_user волонтёров
        const volunteersUserQuery = await pool.query(`
            SELECT id_user
            FROM Volunteers
            WHERE id_volunteer = ANY($1)
        `, [id_volunteers]);
        const volunteerUserIds = volunteersUserQuery.rows.map(row => row.id_user);

        // Теперь соберём всех участников чата
        const userIds = [clientUserId, ...volunteerUserIds];

        // Отправляем уведомления через OneSignal
        userIds.forEach((userId) => {
            if (userId !== senderId) {
                sendNotification(
                    'Новое сообщение в чате',
                    messageText,
                    userId
                );
            }
        });

        // Отправляем через WebSocket
        userIds.forEach((connectedUserId) => {
            const userSocket = users.get(String(connectedUserId));
            if (userSocket && userSocket.readyState === WebSocket.OPEN) {
                console.log(connectedUserId)
                userSocket.send(JSON.stringify({
                    event: "new_message",
                    taskId: taskId,
                    senderId: senderId,
                    messageText: messageText,
                    createdAt: message.created_at
                }));
                
            }
        });

        res.status(201).json(message);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/bd/get-support-messages', async (req, res) => {
    const { userId } = req.query;

    try {
        const result = await pool.query(`
            SELECT sender_id, message_text, created_at 
            FROM Messages 
            WHERE id_task IS NULL AND sender_id = $1
            ORDER BY created_at ASC
        `, [userId]);

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching support messages:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/bd/send-support-message', async (req, res) => {
    const { senderId, messageText } = req.body;

    try {
        const result = await pool.query(`
            INSERT INTO Messages (sender_id, message_text) 
            VALUES ($1, $2) 
            RETURNING id_message, created_at
        `, [senderId, messageText]);

        const message = result.rows[0];

        // Уведомление только одному модератору или всем модераторам
        const modsQuery = await pool.query(`SELECT id_user FROM Moderators`);
        const moderatorIds = modsQuery.rows.map(row => row.id_user);

        // WebSocket
        moderatorIds.forEach((modId) => {
            const socket = users.get(String(modId));
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    event: "new_message",
                    senderId: senderId,
                    messageText: messageText,
                    createdAt: message.created_at
                }));
            }
        });

        const senderSocket = users.get(String(senderId));
        if (senderSocket && senderSocket.readyState === WebSocket.OPEN) {
            senderSocket.send(JSON.stringify({
                event: "support_message",
                senderId: senderId,
                messageText: messageText,
                createdAt: message.created_at
            }));
        }

        res.status(201).json(message);
    } catch (error) {
        console.error('Error sending support message:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/bd/edit-task', async (req, res) => {
    const {
        taskId,
        taskName,
        taskDescription,
        taskComment,
        taskVolunteersCount,
        taskStartDate,
        taskStartTime,
        taskAddress,
        taskDuration
    } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE tasks
      SET
        task_name = $1,
        task_description = $2,
        task_comment = $3,
        task_volunteers_count = $4,
        task_start_date = $5,
        task_start_time = $6,
        task_address = $7,
        task_duration = $8
      WHERE id_task = $9
      RETURNING *;
      `,
      [
        taskName,
        taskDescription,
        taskComment,
        taskVolunteersCount,
        taskStartDate,
        taskStartTime,
        taskAddress,
        taskDuration,
        taskId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Задача не найдена' });
    }

    res.status(200).json({ status: 'success', task: result.rows[0] });
  } catch (error) {
    console.error('Ошибка при обновлении задачи:', error);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});
  
setInterval(async () => {
    const now = new Date();
  
    const tasks = await pool.query(`
      SELECT 
        Tasks.id_task,
        Tasks.task_number,
        c.id_user AS client_user_id,
        array_agg(v.id_user) AS volunteer_user_ids
      FROM Tasks
      JOIN Clients c ON Tasks.id_client = c.id_client
      LEFT JOIN Volunteers v ON v.id_volunteer = ANY(Tasks.id_volunteers)
      WHERE task_status = 'Создана'
        AND (task_start_date || ' ' || task_start_time)::timestamp <= NOW()
      GROUP BY Tasks.id_task, c.id_user
    `);
  
    tasks.rows.forEach(task => {
      const { id_task, task_number, client_user_id, volunteer_user_ids } = task;
  
      const allUserIds = [client_user_id, ...(volunteer_user_ids || [])];
  
      allUserIds.forEach(userId => {
        const client = users.get(String(userId));
        console.log(userId)

        sendNotification('Заявка началась!', `Ваша заявка ${task_number} уже в процессе`, userId);
  
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            action: 'task_started',
            taskId: id_task
          }));
        }
      });
    });
  }, 60000);
  
  
async function sendNotification(title, message, externalUserId) {
    const options = {
        method: 'POST',
        url: 'https://api.onesignal.com/notifications?c=push',
        headers: {
          accept: 'application/json',
          Authorization: 'Key os_v2_app_b6n4lj27bjb4jarhzvinpzdwg6nyf2itesyel2uuxy5kdc4ihgsi2ve7ns7cxpixgqcbfsbd6qho3z4p5gfxl2pffnjcg3abbeedpci',
          'content-type': 'application/json'
        },
        data: {
          app_id: '0f9bc5a7-5f0a-43c4-8227-cd50d7e47637',
          contents: {en: message},
          headings: {en: title},
          include_external_user_ids: [String(externalUserId)]
        }
      };

      console.log("Сообщение отправлено")
      
      axios
        .request(options)
        .then(res => console.log(res.data))
        .catch(err => console.error(err));
}

server.listen(port, () => {
    console.log(`Сервер работает на порту ${port}`);
});