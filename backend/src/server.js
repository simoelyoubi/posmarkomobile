require('dotenv').config();
const express = require('express');

const authRoutes = require('./routes/authRoutes');
const syncRoutes = require('./routes/syncRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/sync', syncRoutes);
app.use('/dashboard', dashboardRoutes);

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`POS sync backend listening on :${port}`);
});
