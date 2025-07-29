require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

async function getAuthClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SA_KEY),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return await auth.getClient();
}

async function getSheets() {
    const authClient = await getAuthClient();
    return google.sheets({ version: 'v4', auth: authClient });
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// GET /getconfirmationid?orderid=XYZ123
app.get('/getconfirmationid', async (req, res) => {
    const orderId = req.query.orderid;
    const iid = req.query.iid;
    if (!orderId) {
        return res.status(400).json({ error: 'Missing orderid parameter' });
    }

    try {
        // 1. Initialize Sheets API client
        const sheets = await getSheets();

        // 2. Fetch columns A (order-id) and B (used flag)
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'Emails!A:H',
        });
        const rows = result.data.values || [];

        // 3. Locate the row index (0-based)
        const rowIndex = rows.findIndex(r => r[4] === orderId);
        console.log(`Row index for order Id: ${orderId} is ${rowIndex}`);

        if (rowIndex === -1) {
            return res.status(404).json({ error: 'Order ID not found' });
        }
        // if (rowIndex === -1) {
        //   return res.status(404).json({ error: 'Order ID not found' });
        // }

        // 4. Check if already used
        const usedFlag = rows[5] === 'true' || rows[5] === true;
        console.log(`Used flag for order Id: ${orderId} is ${usedFlag}`);
        if (usedFlag) {
            return res.status(409).json({ error: 'Order ID already used' });
        }

        // 5. Mark as used (update column B)
        //    If you have a header row in your sheet, add +2 instead of +1 below.
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: `Emails!F${rowIndex + 1}`,  
          valueInputOption: 'RAW',
          requestBody: {
            values: [['true']],
          },
        });

        const apiKey = process.env.API_KEY;
        const url = `https://pidkey.com/ajax/cidms_api?iids=${iid}&justforcheck=0&apikey=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch confirmation ID: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Confirmation ID data:', data); 
        if (data === undefined || data === null) {
            return res.status(404).json({ error: 'Confirmation ID not found' });
        }else{
            return res.json({ Installation Id: data.confirmationid });
        }

    } catch (err) {
        console.error('Error in /getconfirmationid:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});