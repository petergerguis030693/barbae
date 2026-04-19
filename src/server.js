const app = require('./app');
const { pool } = require('./config/db');

const PORT = Number(process.env.PORT || 3000);

async function bootstrap() {
  try {
    await pool.query('SELECT 1');
    app.listen(PORT, () => {
      console.log(`Adminpanel gestartet auf http://localhost:${PORT}/admin`);
    });
  } catch (error) {
    console.error('Datenbankverbindung fehlgeschlagen:', error.message);
    process.exit(1);
  }
}

bootstrap();
