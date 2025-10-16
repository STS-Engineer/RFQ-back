const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const rfqrouter = require('./services/rfqservice');

const app = express();

// Configure CORS
const corsOptions = {
  origin: 'https://rfq-management.azurewebsites.net', // frontend domain
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.json());

// Routes
app.use('/ajouter', rfqrouter);

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
