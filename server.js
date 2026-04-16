const express = require('express');
const path = require('path');

const app = express();

function getCliOption(name) {
  const args = process.argv.slice(2);
  const prefix = `--${name}=`;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === `--${name}`) {
      return args[i + 1];
    }
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }

  return undefined;
}

const hostArg = getCliOption('host');
const portArg = getCliOption('port');
const HOST = hostArg || process.env.HOST || '127.0.0.1';
const parsedPort = Number.parseInt(portArg || process.env.PORT || '3000', 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/todos', require('./routes/todos'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/export', require('./routes/export'));
app.use('/api/settings', require('./routes/settings'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  const accessHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Todo App running at http://${accessHost}:${PORT}`);
});
