const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');
const cron = require('node-cron'); 

const app = express();
const port = 5000;
const apiUrl = 'http://esp32-weather.local/info'; 

app.use(bodyParser.json());

// Function to get the current year 
const getCurrentYear = () => {
  const today = new Date();
  return today.getFullYear();
};

// Function to get the current month 
const getCurrentMonth = () => {
  const today = new Date();
  return today.toLocaleString('en-US', { month: 'long' });
};

// Function to get the data file path for the current month and year
const getDataFilePath = () => {
  const currentMonth = getCurrentMonth();
  const currentYear = getCurrentYear();
  const yearDir = path.join(__dirname, '..', `data_${currentYear}`); 
  if (!fs.existsSync(yearDir)) {
    fs.mkdirSync(yearDir); // Create year directory if it doesn't exist
  }
  return path.join(yearDir, `weather_data_${currentMonth}.json`);
};

// Function to read data from the JSON file
const readWeatherData = () => {
  const filePath = getDataFilePath();
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') { // File not found
      console.log(`Creating new file for ${getCurrentMonth()} in ${getCurrentYear()}`);
      writeWeatherData([]); // Create an empty array for the new month
      return [];
    } else {
      console.error(`Error reading weather data for ${getCurrentMonth()} in ${getCurrentYear()}:`, err);
      return []; 
    }
  }
};

// Function to write data to the JSON file
const writeWeatherData = (data) => {
  const filePath = getDataFilePath();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Function to fetch data from the API
const fetchDataFromApi = async () => {
  try {
    const response = await axios.get(apiUrl);
    const apiData = response.data; 
    const newWeatherData = {
      temperature: apiData.temperature, 
      humidity: apiData.humidity, 
      timestamp: Date.now() 
    };
    const existingData = readWeatherData();

    // Check if data for the current hour already exists
    const currentHour = new Date().getHours();
    const hasCurrentHourData = existingData.some(entry => 
      new Date(entry.timestamp).getHours() === currentHour
    );

    if (!hasCurrentHourData) { 
      existingData.push(newWeatherData);
      writeWeatherData(existingData);
      console.log('Data fetched and saved successfully.');
    } else {
      console.log(`Data for the current hour already exists.`);
    }
  } catch (error) {
    console.error('Error fetching data from API:', error);
  }
};

// Schedule the data fetching task every hour at 0 minutes
cron.schedule('0 * * * *', fetchDataFromApi); 

// Check for current hour data on application startup
fetchDataFromApi(); 

// GET endpoint to retrieve all or filtered weather data
app.get('/weather', (req, res) => {
  try {
    const weatherData = readWeatherData();
    const filterBy = req.query.filterBy;
    const filterValue = req.query.filterValue;

    const filteredData = filterBy ? filterData(weatherData, filterBy, filterValue) : weatherData;
    res.json(filteredData);
  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET endpoint to retrieve highest and lowest temperature
app.get('/tempdata', (req, res) => {
  try {
    const weatherData = readWeatherData();
    const filterBy = req.query.filterBy || 'day';
    const filterValue = req.query.filterValue;

    if (filterBy === 'day') {
      const filterDay = new Date(filterValue).getDate();
      const { highest, lowest } = findMinMaxTemperature(weatherData, filterBy, filterDay);
      res.json({ highest, lowest });
    } else {
      const { highest, lowest } = findMinMaxTemperature(weatherData, filterBy, filterValue);
      res.json({ highest, lowest });
    }
  } catch (error) {
    console.error('Error retrieving temperature data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Helper function to filter data by criteria
const filterData = (data, filterBy, filterValue) => {
  switch (filterBy) {
    case 'day':
      const filterDay = new Date(filterValue).getDate(); 
      return data.filter(entry => 
        new Date(entry.timestamp).getDate() === filterDay
      );
    case 'month':
      const filterMonth = new Date(filterValue).getMonth(); 
      return data.filter(entry => 
        new Date(entry.timestamp).getMonth() === filterMonth
      );
    case 'hour':
      const filterHour = parseInt(filterValue); 
      return data.filter(entry => 
        new Date(entry.timestamp).getHours() === filterHour
      );
    case 'timestamp':
      const filterTimestamp = parseInt(filterValue);
      return data.filter(entry => entry.timestamp === filterTimestamp);
    case 'year': 
        const filterYear = new Date(filterValue).getFullYear(); 
        return data.filter(entry => 
            new Date(entry.timestamp).getFullYear() === filterYear
        );
    default:
      return data; // No filter applied
  }
};

// Helper function to find highest and lowest temperature
const findMinMaxTemperature = (data, filterBy, filterValue) => {
  const filteredData = filterData(data, filterBy, filterValue);

  if (filteredData.length === 0) {
    return { highest: null, lowest: null };
  }

  const temperatures = filteredData.map(entry => entry.temperature);
  return {
    highest: Math.max(...temperatures),
    lowest: Math.min(...temperatures)
  };
};

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});