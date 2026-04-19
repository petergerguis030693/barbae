const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const dotenv = require('dotenv');

dotenv.config();

const adminRouter = require('./routes/admin');
const storeRouter = require('./routes/store.routes');
const webhooksRouter = require('./routes/webhooks.routes');
const { pool } = require('./config/db');

const app = express();
const MySQLStore = MySQLStoreFactory(session);

app.set('trust proxy', 1);

const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: Number(process.env.SESSION_CLEAR_INTERVAL_MS || 15 * 60 * 1000),
    expiration: Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 30),
    createDatabaseTable: true
  },
  pool
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(
  session({
    name: process.env.SESSION_NAME || 'admin.sid',
    secret: process.env.SESSION_SECRET || 'change-me',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 30)
    }
  })
);

app.use((req, res, next) => {
  res.locals.customerUser = req.session.customerUser || null;
  res.locals.gaMeasurementId = process.env.GA_MEASUREMENT_ID || '';
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'public')));
app.use('/webhooks', webhooksRouter);
app.use('/admin', adminRouter);
app.use('/', storeRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Interner Serverfehler');
});

module.exports = app;
