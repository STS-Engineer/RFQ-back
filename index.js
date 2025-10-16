const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();


const rfqrouter = require('./services/rfqservice');

const app = express();

app.use(cors({
  origin: 'https://rfq-management.azurewebsites.net',  // frontend domain
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'https://rfq-management.azurewebsites.net');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.json());

// Routes
app.use('/ajouter', rfqrouter);

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

// Bind to 0.0.0.0 so it’s reachable from outside the container
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
