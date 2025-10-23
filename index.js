const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const rfqrouter = require('./services/rfqservice');

const app = express();

app.use('/uploads', express.static('uploads'));

// Allow frontend domain
app.use(cors({
  origin: 'https://rfq-management.azurewebsites.net',
  credentials: true
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.json());

// Routes
app.use('/ajouter', rfqrouter);

// Health check route
app.get('/', (req, res) => res.send('Backend is running'));

const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
